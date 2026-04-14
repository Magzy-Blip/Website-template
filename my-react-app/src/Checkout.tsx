import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { CheckoutCartSnapshot } from './checkout_types.ts';
import type { FulfillmentMethod } from './shop_types.ts';
import {
  completed_order_count_for_customer,
  load_account_profile,
  loyalty_discount_applies,
  price_after_loyalty,
  save_pending_checkout,
  loyalty_discount_fraction,
  loyalty_min_subtotal_gbp,
  loyalty_purchases_per_reward,
} from './order_storage.ts';

function load_snapshot(state: unknown): CheckoutCartSnapshot | null {
  if (state && typeof state === 'object' && 'lines' in state) {
    const s = state as CheckoutCartSnapshot;
    if (Array.isArray(s.lines) && s.lines.length > 0) return s;
  }
  try {
    const raw = sessionStorage.getItem('checkout_cart');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutCartSnapshot;
    if (Array.isArray(parsed.lines) && parsed.lines.length > 0) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function line_total(line: { quantity: number; unitPrice: string }): number {
  const u = Number.parseFloat(line.unitPrice);
  if (!Number.isFinite(u)) return 0;
  return u * line.quantity;
}

export function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();

  const snapshot = useMemo(() => load_snapshot(location.state), [location.state]);
  const email = localStorage.getItem('accountEmail');
  const profile = load_account_profile(email);

  const [buyer_name, set_buyer_name] = useState(
    profile.displayName || localStorage.getItem('accountDisplayName') || '',
  );
  const [address_line, set_address_line] = useState(profile.addressLine);
  const [postcode, set_postcode] = useState(profile.postcode);
  const [error, set_error] = useState<string | null>(null);
  const [fulfillment, set_fulfillment] = useState<FulfillmentMethod>('collection');

  const subtotal = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.lines.reduce((s, l) => s + line_total(l), 0);
  }, [snapshot]);

  const completed_before = useMemo(() => completed_order_count_for_customer(email), [email]);

  const loyalty_applies = useMemo(
    () => loyalty_discount_applies(subtotal, completed_before),
    [subtotal, completed_before],
  );

  const order_total = useMemo(
    () => price_after_loyalty(subtotal, completed_before),
    [subtotal, completed_before],
  );

  useEffect(() => {
    set_buyer_name(profile.displayName || localStorage.getItem('accountDisplayName') || '');
    set_address_line(profile.addressLine);
    set_postcode(profile.postcode);
  }, [profile.displayName, profile.addressLine, profile.postcode]);

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-8">
        <p className="text-slate-400 mb-6">Nothing to check out.</p>
        <Link
          to="/landing"
          className="px-6 py-3 rounded-xl bg-sky-500 text-slate-900 font-bold hover:bg-sky-400 transition-colors"
        >
          Back to shop
        </Link>
      </div>
    );
  }

  function place_order() {
    if (!snapshot) return;
    set_error(null);
    const name = buyer_name.trim();
    const addr = address_line.trim();
    const pc = postcode.trim();
    if (!name || !addr || !pc) {
      set_error('Please enter your name, address, and postcode.');
      return;
    }

    const loyalty = loyalty_discount_applies(subtotal, completed_before);
    const total_str = order_total.toFixed(2);
    const sub_str = subtotal.toFixed(2);

    sessionStorage.removeItem('checkout_thankyou');
    save_pending_checkout({
      lines: snapshot.lines,
      total: total_str,
      fulfillment,
      customerEmail: email?.trim().toLowerCase() ?? null,
      buyerName: name,
      addressLine: addr,
      postcode: pc,
      loyaltyDiscountApplied: loyalty,
      subtotalBeforeDiscount: sub_str,
    });

    sessionStorage.removeItem('checkout_cart');
    sessionStorage.setItem('clear_cart_after_checkout', '1');
    navigate('/checkout/success');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 flex flex-col items-center">
      <div className="w-full max-w-md mt-8">
        <Link to="/landing" className="text-sm text-sky-400 hover:text-sky-300 font-semibold">
          Back to shop
        </Link>

        <header className="mt-8 mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">Checkout</h1>
          <p className="text-sm text-slate-400 mt-2">
            Orders are completed in this browser. No external payment service is used.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Delivery details</p>
          <div>
            <label htmlFor="chk-name" className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Full name
            </label>
            <input
              id="chk-name"
              value={buyer_name}
              onChange={(e) => set_buyer_name(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label htmlFor="chk-addr" className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Address
            </label>
            <input
              id="chk-addr"
              value={address_line}
              onChange={(e) => set_address_line(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label htmlFor="chk-post" className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Postcode
            </label>
            <input
              id="chk-post"
              value={postcode}
              onChange={(e) => set_postcode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Order summary</p>
          <ul className="space-y-3 text-sm border-b border-slate-800 pb-4 mb-4">
            {snapshot.lines.map((line, i) => (
              <li key={`${line.name}-${i}`} className="flex justify-between gap-3">
                <span className="text-slate-300">
                  <span className="font-semibold text-white">{line.name}</span>
                  <span className="text-slate-500"> x {line.quantity}</span>
                </span>
                <span className="tabular-nums text-slate-300">£{line_total(line).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Subtotal</span>
              <span className="tabular-nums text-slate-300">£{subtotal.toFixed(2)}</span>
            </div>
            {loyalty_applies && (
              <div className="flex justify-between items-baseline text-emerald-400">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Loyalty ({loyalty_purchases_per_reward}th purchase, over £{loyalty_min_subtotal_gbp})
                </span>
                <span className="tabular-nums">-{(loyalty_discount_fraction * 100).toFixed(0)}%</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total</span>
              <span className="text-xl font-black text-sky-400 tabular-nums">£{order_total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Fulfillment</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => set_fulfillment('collection')}
              className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold transition-colors ${
                fulfillment === 'collection'
                  ? 'border-sky-500 bg-sky-500/15 text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Collection</span>
              Pick up in store
            </button>
            <button
              type="button"
              onClick={() => set_fulfillment('delivery')}
              className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold transition-colors ${
                fulfillment === 'delivery'
                  ? 'border-sky-500 bg-sky-500/15 text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Delivery</span>
              Ship to your address
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl text-sm border bg-red-500/10 border-red-500/40 text-red-300">{error}</div>
        )}

        <button
          type="button"
          onClick={place_order}
          className="mt-6 w-full py-3.5 rounded-xl bg-sky-500 text-slate-900 font-bold hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/20"
        >
          Place order
        </button>
      </div>
    </div>
  );
}
