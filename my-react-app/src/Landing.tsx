import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CheckoutCartSnapshot } from './checkout_types.ts';
import {
  load_catalog,
  save_catalog,
  orders_for_account,
  load_cart,
  save_cart,
  load_account_profile,
  save_account_profile,
  get_purchase_events_for_seller,
  completed_order_count_for_customer,
  orders_until_next_loyalty_reward,
  loyalty_purchases_per_reward,
  loyalty_min_subtotal_gbp,
  loyalty_discount_fraction,
} from './order_storage.ts';
import { all_preset_names, fruit_names, vegetable_names, produce_image_url } from './images.tsx';
import { get_next_lot_id, pack_date_ymd_local } from './lot_number.ts';
import type { ProduceListing, ShopCartLine } from './shop_types.ts';

const produce_pricing: Record<string, { fair: number; min: number; max: number }> = {
  Carrot: { fair: 0.52, min: 0.35, max: 0.75 },
  Broccoli: { fair: 0.95, min: 0.69, max: 1.25 },
  Spinach: { fair: 1.45, min: 1.09, max: 1.89 },
  Cucumber: { fair: 0.69, min: 0.49, max: 0.95 },
  Tomato: { fair: 0.48, min: 0.32, max: 0.72 },
  Lettuce: { fair: 0.92, min: 0.69, max: 1.19 },
  'Bell pepper': { fair: 0.58, min: 0.42, max: 0.78 },
  Onion: { fair: 0.28, min: 0.18, max: 0.42 },
  Potato: { fair: 0.22, min: 0.15, max: 0.35 },
  Kale: { fair: 1.15, min: 0.85, max: 1.55 },
  Apple: { fair: 0.38, min: 0.26, max: 0.52 },
  Banana: { fair: 0.2, min: 0.14, max: 0.28 },
  Orange: { fair: 0.4, min: 0.28, max: 0.55 },
  Strawberry: { fair: 2.25, min: 1.75, max: 2.85 },
  Grape: { fair: 2.15, min: 1.69, max: 2.79 },
  Blueberry: { fair: 2.65, min: 2.09, max: 3.29 },
  Mango: { fair: 1.3, min: 0.99, max: 1.69 },
  Pear: { fair: 0.45, min: 0.32, max: 0.62 },
  Watermelon: { fair: 4.5, min: 3.29, max: 5.99 },
  Avocado: { fair: 0.99, min: 0.69, max: 1.35 },
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matches(name: string, q_raw: string) {
  const q = norm(q_raw);
  if (!q) return true;
  const n = norm(name);
  return q.split(' ').filter(Boolean).every((t) => n.includes(t));
}

function match_score(name: string, q_raw: string) {
  const q = norm(q_raw);
  const n = norm(name);
  if (!q) return 0;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 800;
  let score = 0;
  for (const t of q.split(' ').filter(Boolean)) {
    if (!n.includes(t)) return -1;
    const words = n.split(' ').filter(Boolean);
    if (n.startsWith(t)) score += 400;
    else if (words.some((w) => w.startsWith(t))) score += 250;
    else score += 80;
  }
  return score;
}

function line_total(line: ShopCartLine) {
  const u = Number.parseFloat(line.unitPrice);
  return Number.isFinite(u) ? u * line.quantity : 0;
}

function is_owner(item: ProduceListing) {
  const me = localStorage.getItem('accountEmail')?.trim().toLowerCase();
  const owner = item.createdByEmail?.trim().toLowerCase();
  return Boolean(me && owner && me === owner);
}

const default_new_item = () => ({
  name: '',
  price: '',
  stockUnits: '48',
  supplier: 'Regional Growers Co-op',
});

const field =
  'w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg outline-none border border-transparent focus:border-sky-500';
const label = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1';

export function Landing() {
  const navigate = useNavigate();
  const [is_dark, set_is_dark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [is_dash_open, set_is_dash_open] = useState(false);
  const [is_cart_open, set_is_cart_open] = useState(false);
  const [is_account_open, set_is_account_open] = useState(false);
  const [items, set_items] = useState<ProduceListing[]>(() => load_catalog());
  const [cart, set_cart] = useState<ShopCartLine[]>([]);
  const cart_ready = useRef(false);
  const [new_item, set_new_item] = useState(default_new_item);
  const [qty_by_listing, set_qty_by_listing] = useState<Record<number, string>>({});
  const [search_query, set_search_query] = useState('');
  const [suggest_open, set_suggest_open] = useState(false);

  const dash_ref = useRef<HTMLDivElement>(null);
  const cart_ref = useRef<HTMLDivElement>(null);
  const account_ref = useRef<HTMLDivElement>(null);
  const search_ref = useRef<HTMLDivElement>(null);

  const account_email = localStorage.getItem('accountEmail');
  const [profile_form, set_profile_form] = useState(() => load_account_profile(account_email));

  const filtered_items = useMemo(() => {
    const q = search_query;
    if (!q.trim()) return items;
    return [...items.filter((i) => matches(i.name, q))].sort(
      (a, b) => match_score(b.name, q) - match_score(a.name, q),
    );
  }, [items, search_query]);

  const suggestions = useMemo(() => {
    const q = search_query.trim();
    if (!q) return [];
    const seen = new Set<string>();
    const rows: { name: string; in_gallery: boolean }[] = [];
    const push = (name: string, in_gallery: boolean) => {
      if (seen.has(name) || !matches(name, q)) return;
      if (match_score(name, q) < 0) return;
      seen.add(name);
      rows.push({ name, in_gallery });
    };
    items.forEach((it) => push(it.name, true));
    all_preset_names.forEach((p) => push(p, items.some((i) => i.name === p)));
    rows.sort((a, b) => match_score(b.name, q) - match_score(a.name, q) || a.name.localeCompare(b.name));
    return rows.slice(0, 10);
  }, [items, search_query]);

  const bounds = new_item.name ? produce_pricing[new_item.name] : undefined;
  const slider_val =
    bounds == null
      ? null
      : Math.min(bounds.max, Math.max(bounds.min, Number.parseFloat(new_item.price) || bounds.fair));

  const account_orders = useMemo(() => orders_for_account(localStorage.getItem('accountEmail')), [is_account_open, items]);
  const purchases = useMemo(() => get_purchase_events_for_seller(account_email), [is_dash_open, account_orders]);
  const loyalty_done = useMemo(
    () => completed_order_count_for_customer(account_email),
    [is_cart_open, account_orders, cart],
  );
  const loyalty_left = orders_until_next_loyalty_reward(loyalty_done);

  const handle_add_item = (e: React.FormEvent) => {
    e.preventDefault();
    const b = produce_pricing[new_item.name];
    if (!b) return;
    const raw = Number.parseFloat(new_item.price);
    const unit = Math.min(b.max, Math.max(b.min, Number.isFinite(raw) ? raw : b.fair));
    const stock = Number.parseInt(new_item.stockUnits, 10);
    const stockUnits = Number.isFinite(stock) && stock >= 0 ? Math.min(99999, stock) : 0;
    const email = localStorage.getItem('accountEmail');
    set_items((prev) => [
      {
        id: Date.now(),
        name: new_item.name,
        price: unit.toFixed(2),
        stockUnits,
        supplier: new_item.supplier.trim() || 'Regional Growers Co-op',
        lotId: get_next_lot_id(new_item.name),
        packedOn: pack_date_ymd_local(),
        createdByEmail: email?.trim().toLowerCase() ?? null,
      },
      ...prev,
    ]);
    set_new_item(default_new_item());
    set_is_dash_open(false);
  };

  const handle_add_to_cart = (listing: ProduceListing) => {
    const qty = Number.parseInt(qty_by_listing[listing.id] ?? '1', 10);
    if (!Number.isFinite(qty) || qty < 1) return;
    const in_cart = cart.filter((l) => l.listingId === listing.id).reduce((s, l) => s + l.quantity, 0);
    const add = Math.min(qty, Math.max(0, listing.stockUnits - in_cart));
    if (add < 1) return;
    set_cart((prev) => {
      const ex = prev.find((l) => l.listingId === listing.id);
      if (ex)
        return prev.map((l) =>
          l.listingId === listing.id ? { ...l, quantity: l.quantity + add } : l,
        );
      return [
        {
          id: Date.now(),
          listingId: listing.id,
          name: listing.name,
          unitPrice: listing.price,
          quantity: add,
          supplier: listing.supplier,
          lotId: listing.lotId,
          packedOn: listing.packedOn,
        },
        ...prev,
      ];
    });
    set_qty_by_listing((p) => ({ ...p, [listing.id]: '1' }));
    set_is_cart_open(true);
  };

  const refresh = useCallback(() => set_items(load_catalog()), []);

  useEffect(() => {
    save_catalog(items);
  }, [items]);

  useEffect(() => {
    const on_vis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', on_vis);
    return () => document.removeEventListener('visibilitychange', on_vis);
  }, [refresh]);

  useEffect(() => {
    if (is_account_open) set_profile_form(load_account_profile(localStorage.getItem('accountEmail')));
  }, [is_account_open]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', is_dark);
    localStorage.setItem('theme', is_dark ? 'dark' : 'light');
  }, [is_dark]);

  useEffect(() => {
    const email = localStorage.getItem('accountEmail');
    if (sessionStorage.getItem('clear_cart_after_checkout') === '1') {
      sessionStorage.removeItem('clear_cart_after_checkout');
      set_cart([]);
      cart_ready.current = true;
      save_cart(email, []);
      return;
    }
    cart_ready.current = false;
    set_cart(load_cart(email));
    cart_ready.current = true;
  }, []);

  useEffect(() => {
    if (!cart_ready.current) return;
    const email = localStorage.getItem('accountEmail');
    if (!email) return;
    const t = window.setTimeout(() => save_cart(email, cart), 600);
    return () => clearTimeout(t);
  }, [cart]);

  useEffect(() => {
    const close = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (!dash_ref.current?.contains(t)) set_is_dash_open(false);
      if (!cart_ref.current?.contains(t)) set_is_cart_open(false);
      if (!account_ref.current?.contains(t)) set_is_account_open(false);
      if (!search_ref.current?.contains(t)) set_suggest_open(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const cart_count = cart.reduce((s, l) => s + l.quantity, 0);
  const cart_total = cart.reduce((s, l) => s + line_total(l), 0);
  const pill = (on: boolean) =>
    `flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full shadow-md border transition-all active:scale-90 ${
      on ? 'bg-sky-500 border-sky-600 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
    }`;

  return (
    <div className="min-h-screen transition-colors duration-500 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white p-6 font-sans">
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 w-full max-w-2xl px-4">
        <div className="relative" ref={dash_ref}>
          <button type="button" onClick={() => set_is_dash_open(!is_dash_open)} className={pill(is_dash_open)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </button>
          {is_dash_open && (
            <form onSubmit={handle_add_item} className="absolute left-0 mt-3 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Create item</p>
              <div>
                <label htmlFor="create-produce" className={label}>Produce</label>
                <select
                  id="create-produce"
                  required
                  value={new_item.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const pb = produce_pricing[name];
                    set_new_item({ ...new_item, name, price: pb ? pb.fair.toFixed(2) : '' });
                  }}
                  className={field}
                >
                  <option value="" disabled>Choose a fruit or vegetable...</option>
                  <optgroup label="Vegetables">{vegetable_names.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>
                  <optgroup label="Fruits">{fruit_names.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>
                </select>
              </div>
              {bounds != null && slider_val != null && (
                <div>
                  <div className="flex justify-between gap-2 mb-1">
                    <label htmlFor="create-price-range" className={label}>Unit price</label>
                    <span className="text-sm font-black text-sky-600 dark:text-sky-400 tabular-nums">£{slider_val.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2">
                    Fair £{bounds.fair.toFixed(2)} · range £{bounds.min.toFixed(2)} – £{bounds.max.toFixed(2)}
                  </p>
                  <input
                    id="create-price-range"
                    type="range"
                    min={bounds.min}
                    max={bounds.max}
                    step={0.01}
                    value={slider_val}
                    onChange={(e) => set_new_item({ ...new_item, price: e.target.value })}
                    className="w-full h-2 accent-sky-500 rounded-full cursor-pointer"
                  />
                </div>
              )}
              <div>
                <label htmlFor="create-stock" className={label}>Stock</label>
                <input id="create-stock" required type="number" min={0} max={99999} step={1} value={new_item.stockUnits} onChange={(e) => set_new_item({ ...new_item, stockUnits: e.target.value })} className={field} />
              </div>
              <div>
                <label htmlFor="create-supplier" className={label}>Supplier</label>
                <input id="create-supplier" type="text" value={new_item.supplier} onChange={(e) => set_new_item({ ...new_item, supplier: e.target.value })} className={field} />
              </div>
              {new_item.name ? (
                <div>
                  <label className={label}>Image URL (from images.tsx — preview only)</label>
                  <textarea
                    readOnly
                    tabIndex={-1}
                    rows={2}
                    value={produce_image_url(new_item.name) || '(empty in images.tsx)'}
                    className={`${field} resize-none cursor-default opacity-90 text-slate-600 dark:text-slate-400 text-xs`}
                  />
                </div>
              ) : null}
              {purchases.length > 0 && (
                <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                  <p className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 mb-2">Your buyers</p>
                  <ul className="space-y-2 max-h-36 overflow-y-auto text-[11px]">
                    {purchases.map((ev) => (
                      <li key={`${ev.orderId}-${ev.listingId}-${ev.placedAt}`} className="rounded-lg border border-emerald-100 dark:border-emerald-900/50 bg-white/60 dark:bg-slate-900/40 p-2">
                        <p className="font-semibold">{ev.buyerName}</p>
                        <p className="text-slate-600 dark:text-slate-400">{ev.addressLine}</p>
                        <p className="text-slate-500">{ev.postcode}</p>
                        <p className="text-[10px] text-slate-500 mt-1">{ev.productName} ×{ev.quantity}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button type="submit" className="w-full py-2 bg-sky-500 text-white text-sm font-bold rounded-lg hover:bg-sky-600 shadow-lg shadow-sky-500/20">Add to gallery</button>
            </form>
          )}
        </div>

        <div className="relative flex-grow z-40" ref={search_ref}>
          <input
            type="search"
            role="combobox"
            aria-expanded={suggest_open && Boolean(search_query.trim())}
            aria-controls="search-suggest-list"
            autoComplete="off"
            placeholder="Search items..."
            value={search_query}
            onChange={(e) => { set_search_query(e.target.value); set_suggest_open(true); }}
            onFocus={() => set_suggest_open(true)}
            className="w-full py-2.5 pl-11 pr-4 rounded-full outline-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md focus:ring-2 focus:ring-sky-500/50"
          />
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          {suggest_open && search_query.trim() && (
            <ul id="search-suggest-list" role="listbox" className="absolute left-0 right-0 top-full mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1 text-sm">
              {suggestions.length === 0 ? (
                <li className="px-4 py-3 text-slate-500 italic">No matches</li>
              ) : (
                suggestions.map(({ name, in_gallery }) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex justify-between gap-2"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => { set_search_query(name); set_suggest_open(false); }}
                    >
                      <span className="font-medium truncate">{name}</span>
                      <span className={`shrink-0 text-[10px] uppercase font-bold ${in_gallery ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {in_gallery ? 'In gallery' : 'Catalog'}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <div className="relative" ref={cart_ref}>
          <button type="button" onClick={() => set_is_cart_open(!is_cart_open)} className={`relative ${pill(is_cart_open)}`} aria-label={cart_count > 0 ? `Cart, ${cart_count} items` : 'Cart'}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
            {cart_count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">{cart_count > 99 ? '99+' : cart_count}</span>
            )}
          </button>
          {is_cart_open && (
            <div className="absolute right-0 mt-3 w-72 max-h-[min(24rem,calc(100vh-8rem))] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Cart</p>
              {cart.length === 0 ? (
                <p className="text-center py-4 text-sm text-slate-500 italic">Empty</p>
              ) : (
                <>
                  <ul className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1 -mr-1">
                    {cart.map((line) => (
                      <li key={line.id} className="flex gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{line.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {line.quantity} × £{line.unitPrice} <span className="text-sky-600 dark:text-sky-400 font-semibold">£{line_total(line).toFixed(2)}</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-1">{line.supplier} · Lot {line.lotId}{line.packedOn ? ` · ${line.packedOn}` : ''}</p>
                        </div>
                        <button type="button" onClick={() => set_cart((p) => p.filter((l) => l.id !== line.id))} className="shrink-0 p-1 text-slate-400 hover:text-red-500" aria-label={`Remove ${line.name}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                    <span className="text-xs font-bold uppercase text-slate-500">Total</span>
                    <span className="text-lg font-black text-sky-500">£{cart_total.toFixed(2)}</span>
                  </div>
                  <div className="mt-3 rounded-xl border border-violet-200/80 dark:border-violet-800/60 bg-violet-50/70 dark:bg-violet-950/25 px-3 py-2 text-[10px] text-slate-600 dark:text-slate-400">
                    <span className="font-bold text-violet-800 dark:text-violet-300">Loyalty: </span>
                    Every {loyalty_purchases_per_reward} orders: {(loyalty_discount_fraction * 100).toFixed(0)}% off over £{loyalty_min_subtotal_gbp.toFixed(2)}.
                    {' '}{loyalty_left === 0 ? 'Next order may qualify if total is high enough.' : `${loyalty_left} more until next milestone.`}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const snapshot: CheckoutCartSnapshot = {
                        lines: cart.map((l) => ({
                          name: l.name,
                          quantity: l.quantity,
                          unitPrice: l.unitPrice,
                          listingId: l.listingId,
                          supplier: l.supplier,
                          lotId: l.lotId,
                          packedOn: l.packedOn,
                        })),
                        total: cart_total.toFixed(2),
                      };
                      sessionStorage.setItem('checkout_cart', JSON.stringify(snapshot));
                      set_is_cart_open(false);
                      navigate('/checkout', { state: snapshot });
                    }}
                    className="mt-3 w-full py-2.5 rounded-xl bg-sky-500 text-white text-sm font-bold hover:bg-sky-600"
                  >Checkout</button>
                  <p className="mt-2 text-[10px] text-center text-slate-500">Orders stay in this browser.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="fixed top-6 right-6 z-50" ref={account_ref}>
        <button type="button" onClick={() => set_is_account_open(!is_account_open)} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 pr-4 rounded-full shadow-md hover:shadow-lg active:scale-95">
          <div className="w-8 h-8 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-[10px]">GLH</div>
          <span className="text-sm font-semibold hidden lg:inline">Account</span>
        </button>
        {is_account_open && (
          <div className="absolute right-0 mt-2 w-80 max-h-[min(28rem,85vh)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3">
            <p className="text-[10px] uppercase text-slate-400 font-bold px-2 mb-2">Theme</p>
            <div className="relative flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-2">
              <div className={`absolute h-[calc(100%-8px)] w-[calc(50%-4px)] bg-white dark:bg-slate-600 rounded-lg shadow transition-transform duration-300 ${is_dark ? 'translate-x-full' : ''}`} />
              <button type="button" onClick={() => set_is_dark(false)} className={`relative z-10 flex-1 py-1.5 text-xs font-bold ${!is_dark ? 'text-sky-600 dark:text-white' : 'text-slate-500'}`}>Light</button>
              <button type="button" onClick={() => set_is_dark(true)} className={`relative z-10 flex-1 py-1.5 text-xs font-bold ${is_dark ? 'text-sky-600 dark:text-white' : 'text-slate-500'}`}>Dark</button>
            </div>
            <hr className="border-slate-100 dark:border-slate-800 my-2" />
            <p className="text-[10px] uppercase text-slate-400 font-bold px-2 mb-2">Your details</p>
            <div className="space-y-2 px-1 pb-3">
              <input aria-label="Name" value={profile_form.displayName} onChange={(e) => set_profile_form((p) => ({ ...p, displayName: e.target.value }))} className={field} placeholder="Name" />
              <input aria-label="Address" value={profile_form.addressLine} onChange={(e) => set_profile_form((p) => ({ ...p, addressLine: e.target.value }))} className={field} placeholder="Address" />
              <input aria-label="Postcode" value={profile_form.postcode} onChange={(e) => set_profile_form((p) => ({ ...p, postcode: e.target.value }))} className={field} placeholder="Postcode" />
              <button
                type="button"
                onClick={() => {
                  const em = localStorage.getItem('accountEmail');
                  if (!em) return;
                  save_account_profile(em, profile_form);
                  localStorage.setItem('accountDisplayName', profile_form.displayName.trim());
                }}
                className="w-full py-2 rounded-lg bg-sky-500 text-white text-xs font-bold hover:bg-sky-600"
              >Save</button>
            </div>
            <hr className="border-slate-100 dark:border-slate-800 my-2" />
            <p className="text-[10px] uppercase text-slate-400 font-bold px-2 mb-2">Orders</p>
            {account_orders.length === 0 ? (
              <p className="px-2 pb-2 text-xs text-slate-500">No orders yet.</p>
            ) : (
              <ul className="space-y-2 px-1 pb-2 max-h-48 overflow-y-auto text-[11px]">
                {account_orders.map((ord) => (
                  <li key={ord.id} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2">
                    <div className="flex justify-between font-semibold gap-2">
                      <span className="truncate">{new Date(ord.placedAt).toLocaleString()}</span>
                      <span className="text-sky-600 dark:text-sky-400 shrink-0">£{ord.total}</span>
                    </div>
                    <p className="text-slate-500">{ord.fulfillment === 'delivery' ? 'Delivery' : 'Collection'}{ord.loyaltyDiscountApplied ? ' · Loyalty' : ''}</p>
                    {(ord.buyerName || ord.addressLine || ord.postcode) && (
                      <p className="text-[10px] text-slate-500 mt-1">{[ord.buyerName, ord.addressLine, ord.postcode].filter(Boolean).join(' · ')}</p>
                    )}
                    <ul className="mt-1 text-slate-600 dark:text-slate-400">
                      {ord.lines.map((ln, idx) => (
                        <li key={`${ord.id}-${idx}`} className="truncate">{ln.name} ×{ln.quantity} @ £{ln.unitPrice}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <hr className="border-slate-100 dark:border-slate-800 my-2" />
            <button type="button" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('accountEmail'); navigate('/'); }} className="w-full px-3 py-2 text-sm text-red-500 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl">Sign out</button>
          </div>
        )}
      </div>

      <div className="mt-32 max-w-6xl mx-auto px-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center opacity-40">
            <div className="w-20 h-20 border-2 border-dashed border-slate-400 rounded-full mb-4 flex items-center justify-center text-3xl text-slate-400">+</div>
            <p className="text-slate-500 italic">Nothing listed yet — use the + button.</p>
          </div>
        ) : filtered_items.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <p className="text-slate-600 dark:text-slate-300">No match for &ldquo;{search_query.trim()}&rdquo;</p>
            <button type="button" onClick={() => set_search_query('')} className="mt-4 text-sm font-semibold text-sky-600 dark:text-sky-400 hover:underline">Clear search</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered_items.map((item) => {
              const qty_draft = qty_by_listing[item.id] ?? '1';
              const in_cart = cart.filter((l) => l.listingId === item.id).reduce((s, l) => s + l.quantity, 0);
              const left = Math.max(0, item.stockUnits - in_cart);
              const max_pick = Math.max(1, left);
              const stock_lbl =
                item.stockUnits <= 0 ? 'Out of stock' : left <= 3 ? `Low (${left})` : `In stock (${item.stockUnits})`;
              return (
                <div key={item.id} className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm hover:shadow-xl transition-all">
                  <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4 relative overflow-hidden">
                    {produce_image_url(item.name) ? (
                      <img src={produce_image_url(item.name)} alt="" className="relative z-10 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                    ) : null}
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500 uppercase text-center px-2 pointer-events-none">No image</div>
                    <span className={`absolute bottom-2 left-2 right-2 text-center text-[10px] font-bold uppercase rounded-lg py-1 ${item.stockUnits <= 0 ? 'bg-red-500/90 text-white' : left <= 3 ? 'bg-amber-500/90 text-slate-900' : 'bg-emerald-600/90 text-white'}`}>{stock_lbl}</span>
                  </div>
                  <h3 className="font-bold text-lg">{item.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">£{item.price}</span> / unit · {left} to add
                  </p>
                  <div className="mt-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 p-2.5 text-[10px] text-slate-600 dark:text-slate-400">
                    <p className="font-bold uppercase text-slate-500 mb-1">Traceability</p>
                    <p><span className="font-semibold">Supplier:</span> {item.supplier}</p>
                    <p><span className="font-semibold">Lot:</span> {item.lotId}</p>
                    {item.packedOn ? <p><span className="font-semibold">Packed:</span> {item.packedOn}</p> : null}
                  </div>
                  <label htmlFor={`qty-${item.id}`} className={`${label} mt-3`}>Qty</label>
                  <input
                    id={`qty-${item.id}`}
                    type="number"
                    min={1}
                    max={max_pick}
                    step={1}
                    value={qty_draft}
                    onChange={(e) => set_qty_by_listing((p) => ({ ...p, [item.id]: e.target.value }))}
                    disabled={left < 1}
                    className={`${field} tabular-nums disabled:opacity-50`}
                  />
                  <button type="button" onClick={() => handle_add_to_cart(item)} disabled={left < 1} className="mt-3 w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm sm:opacity-0 sm:group-hover:opacity-100 hover:bg-sky-100 dark:hover:bg-sky-900/40 disabled:opacity-40">
                    {left < 1 ? 'Unavailable' : 'Add to cart'}
                  </button>
                  {is_owner(item) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Remove “${item.name}” from the gallery?`)) return;
                        set_cart((p) => p.filter((l) => l.listingId !== item.id));
                        set_items((p) => p.filter((it) => it.id !== item.id));
                      }}
                      className="mt-3 w-full min-h-[44px] rounded-xl border-2 border-red-500/55 bg-red-50 dark:bg-red-950/35 text-sm font-semibold text-red-800 dark:text-red-100"
                    >Remove listing</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
