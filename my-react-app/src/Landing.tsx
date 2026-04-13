/**
 * Produce shop landing page: gallery with **transparent unit price + stock + traceability**,
 * shopping cart, Stripe checkout handoff, **collection/delivery** chosen on checkout,
 * **order history** in the account menu (localStorage, filtered by logged-in email); prices in **GBP**,
 * preset produce + bounded pricing on create, predictive search, and theme toggle.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CheckoutCartSnapshot } from './checkoutTypes';
import { loadCatalog, saveCatalog, ordersForAccount } from './orderStorage';
import {
  fetchListingsFromServer,
  postListingToServer,
  fetchCartFromServer,
  saveCartToServer,
  deleteListingFromServer,
} from './api';
import { describeLotIdFormat, getNextLotId, packDateYmdLocal } from './lotNumber';
import type { OrderRecord, ProduceListing, ShopCartLine } from './shopTypes';

/**
 * Typical UK supermarket **single item / small retail pack** prices (GBP), with a fair default
 * and min–max band for the create-item slider (ONS / major-multiples style loose & pack pricing, rounded).
 */
const PRODUCE_PRICING: Record<string, { fair: number; min: number; max: number }> = {
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

/** Vegetable names shown in the create-item <select> (each must exist as a key in PRODUCE_PRICING). */
const PRESET_VEGETABLES = [
  'Carrot',
  'Broccoli',
  'Spinach',
  'Cucumber',
  'Tomato',
  'Lettuce',
  'Bell pepper',
  'Onion',
  'Potato',
  'Kale',
] as const;

/** Fruit names shown in the create-item <select> (each must exist as a key in PRODUCE_PRICING). */
const PRESET_FRUITS = [
  'Apple',
  'Banana',
  'Orange',
  'Strawberry',
  'Grape',
  'Blueberry',
  'Mango',
  'Pear',
  'Watermelon',
  'Avocado',
] as const;

/** All preset labels — used to offer search suggestions even before an item exists in the gallery. */
const ALL_PRESET_NAMES = [...PRESET_VEGETABLES, ...PRESET_FRUITS] as readonly string[];

/** Lowercases, strips accents, and removes punctuation so search is forgiving of typing style. */
function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if every whitespace-separated token in the query appears in the normalized item name (AND logic). */
function itemMatchesSearch(name: string, queryRaw: string): boolean {
  const q = normalizeSearchText(queryRaw);
  if (!q) return true;
  const n = normalizeSearchText(name);
  const tokens = q.split(' ').filter(Boolean);
  return tokens.every((t) => n.includes(t));
}

/** Higher = better match for ranking and suggestions */
function searchMatchScore(name: string, queryRaw: string): number {
  const q = normalizeSearchText(queryRaw);
  const n = normalizeSearchText(name);
  if (!q) return 0;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 800;
  const tokens = q.split(' ').filter(Boolean);
  let score = 0;
  for (const t of tokens) {
    if (!n.includes(t)) return -1;
    const words = n.split(' ').filter(Boolean);
    if (n.startsWith(t)) score += 400;
    else if (words.some((w) => w.startsWith(t))) score += 250;
    else score += 80;
  }
  return score;
}

/** Line subtotal in pounds (quantity × unit price) for cart UI and grand total. */
function cartLineTotal(line: ShopCartLine): number {
  const unit = Number.parseFloat(line.unitPrice);
  if (!Number.isFinite(unit)) return 0;
  return unit * line.quantity;
}

function listingCreatedByCurrentAccount(item: ProduceListing): boolean {
  const me = localStorage.getItem('accountEmail')?.trim().toLowerCase();
  const owner = item.createdByEmail?.trim().toLowerCase();
  return Boolean(me && owner && me === owner);
}

export function Landing() {
  const navigate = useNavigate();
  
  // --- THEME & UI STATES ---
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [isDashOpen, setIsDashOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // --- DATA STATES ---
  /** User-created gallery listings (persisted to localStorage — includes stock + trace fields). */
  const [items, setItems] = useState<ProduceListing[]>(() => loadCatalog());
  /** Shopping cart lines; totals are derived with cartLineTotal / cartGrandTotal. */
  const [cart, setCart] = useState<ShopCartLine[]>([]);
  /** After server cart is loaded (or skipped), debounced saves are allowed so an empty initial cart does not wipe the server. */
  const cartSaveReadyRef = useRef(false);
  /**
   * Dashboard "create item" form: preset name, slider price, **initial stock**, and **traceability**
   * (supplier, **auto lot id + auto pack date on save**). See `lotNumber.ts`.
   */
  const [newItem, setNewItem] = useState({
    name: '',
    price: '',
    stockUnits: '48',
    supplier: 'Regional Growers Co-op',
  });
  /** Per listing, the quantity the shopper will add on the next "Add to cart" click (string for controlled inputs). */
  const [qtyToAddByListingId, setQtyToAddByListingId] = useState<Record<number, string>>({});
  /** Current search box text; drives filteredItems and searchSuggestions. */
  const [searchQuery, setSearchQuery] = useState('');
  /** Whether the predictive suggestion dropdown under the search field is visible. */
  const [searchSuggestOpen, setSearchSuggestOpen] = useState(false);

  const dashRef = useRef<HTMLDivElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  /** Wraps search input + suggestion list so outside-click closes suggestions together. */
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // --- LOGIC: ADD ITEM (dashboard form → gallery + shared SQLite catalog) ---
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const bounds = PRODUCE_PRICING[newItem.name];
    if (!bounds) return;
    const raw = Number.parseFloat(newItem.price);
    const unit = Math.min(bounds.max, Math.max(bounds.min, Number.isFinite(raw) ? raw : bounds.fair));
    const stock = Number.parseInt(newItem.stockUnits, 10);
    const stockUnits = Number.isFinite(stock) && stock >= 0 ? Math.min(99999, stock) : 0;
    /** One monotonic, site-wide lot id per new listing (date + global sequence + product segment). */
    const lotId = getNextLotId(newItem.name);
    /** Pack date: local calendar day at save time (matches lot id date segment; not user-edited). */
    const packedOn = packDateYmdLocal();
    const supplier = newItem.supplier.trim() || 'Regional Growers Co-op';
    const createdBy = localStorage.getItem('accountEmail');
    const itemToAdd: ProduceListing = {
      id: Date.now(),
      name: newItem.name,
      price: unit.toFixed(2),
      stockUnits,
      supplier,
      lotId,
      packedOn,
      createdByEmail: createdBy?.trim().toLowerCase() ?? null,
    };
    try {
      await postListingToServer(itemToAdd, createdBy);
      const next = await fetchListingsFromServer();
      setItems(next);
    } catch {
      setItems((prev) => [itemToAdd, ...prev]);
    }
    setNewItem({
      name: '',
      price: '',
      stockUnits: '48',
      supplier: 'Regional Growers Co-op',
    });
    setIsDashOpen(false);
  };

  /**
   * Adds or merges a cart line; **cannot exceed listing.stockUnits** (availability).
   * Copies trace fields onto the line for receipts / order history.
   */
  const handleAddToCart = (listing: ProduceListing) => {
    const raw = qtyToAddByListingId[listing.id];
    const qty = Number.parseInt(raw ?? '1', 10);
    if (!Number.isFinite(qty) || qty < 1) return;
    const existingQty = cart.filter((l) => l.listingId === listing.id).reduce((s, l) => s + l.quantity, 0);
    const maxAdd = Math.max(0, listing.stockUnits - existingQty);
    const addQty = Math.min(qty, maxAdd);
    if (addQty < 1) return;
    setCart((prev) => {
      const existing = prev.find((line) => line.listingId === listing.id);
      if (existing) {
        return prev.map((line) =>
          line.listingId === listing.id
            ? { ...line, quantity: line.quantity + addQty }
            : line,
        );
      }
      return [
        {
          id: Date.now(),
          listingId: listing.id,
          name: listing.name,
          unitPrice: listing.price,
          quantity: addQty,
          supplier: listing.supplier,
          lotId: listing.lotId,
          packedOn: listing.packedOn,
        },
        ...prev,
      ];
    });
    setQtyToAddByListingId((prev) => ({ ...prev, [listing.id]: '1' }));
    setIsCartOpen(true);
  };

  /** Removes a single cart row by its stable cart line id. */
  const handleRemoveCartLine = (cartLineId: number) => {
    setCart((prev) => prev.filter((line) => line.id !== cartLineId));
  };

  /** Deletes a gallery listing on the server when the signed-in user created it (403 otherwise). */
  const handleRemoveListing = async (listing: ProduceListing) => {
    if (!listingCreatedByCurrentAccount(listing)) return;
    if (!window.confirm(`Remove “${listing.name}” from the gallery? This cannot be undone.`)) return;
    const email = localStorage.getItem('accountEmail');
    if (!email) return;
    try {
      await deleteListingFromServer(listing.id, email);
      setCart((prev) => prev.filter((line) => line.listingId !== listing.id));
      const next = await fetchListingsFromServer();
      setItems(next);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not remove listing.');
    }
  };

  /** Badge on cart icon: total units across all lines (not number of distinct products). */
  const cartItemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  /** Sum of all line subtotals for cart footer and checkout snapshot. */
  const cartGrandTotal = cart.reduce((sum, line) => sum + cartLineTotal(line), 0);

  /** Gallery items matching searchQuery, sorted by searchMatchScore (best matches first). */
  const filteredItems = useMemo(() => {
    const q = searchQuery;
    if (!q.trim()) return items;
    const matched = items.filter((i) => itemMatchesSearch(i.name, q)) as ProduceListing[];
    return [...matched].sort(
      (a, b) => searchMatchScore(b.name, q) - searchMatchScore(a.name, q),
    );
  }, [items, searchQuery]);

  /** Top predictive picks: gallery names + catalog presets that match the query, deduped and ranked. */
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const seen = new Set<string>();
    const rows: { name: string; score: number; inGallery: boolean }[] = [];
    const push = (name: string, inGallery: boolean) => {
      if (seen.has(name) || !itemMatchesSearch(name, q)) return;
      const score = searchMatchScore(name, q);
      if (score < 0) return;
      seen.add(name);
      rows.push({ name, score, inGallery });
    };
    for (const it of items) push(it.name, true);
    for (const p of ALL_PRESET_NAMES) push(p, items.some((i) => i.name === p));
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return rows.slice(0, 10);
  }, [items, searchQuery]);

  /** Min/fair/max for the selected produce (undefined until a preset is chosen). */
  const createPriceBounds = newItem.name ? PRODUCE_PRICING[newItem.name] : undefined;
  /** Slider value clamped to [min, max] so the range input always stays in sync with stored price string. */
  const createPriceSliderValue =
    createPriceBounds !== undefined
      ? Math.min(
          createPriceBounds.max,
          Math.max(
            createPriceBounds.min,
            Number.parseFloat(newItem.price) || createPriceBounds.fair,
          ),
        )
      : null;

  /** Persist catalog whenever listings change so stock / trace survive refresh (see orderStorage). */
  useEffect(() => {
    saveCatalog(items);
  }, [items]);

  /** Load shared catalog from the API on mount (falls back to localStorage if the server is down). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchListingsFromServer();
        if (!cancelled) setItems(next);
      } catch {
        /* keep initial loadCatalog() state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** When the tab becomes visible again, refresh listings so another device’s changes appear. */
  const refreshListings = useCallback(async () => {
    try {
      const next = await fetchListingsFromServer();
      setItems(next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshListings();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshListings]);

  /** Orders for the account panel — re-read when opening account or when catalog updates after checkout. */
  const accountOrders: OrderRecord[] = useMemo(() => {
    const email = localStorage.getItem('accountEmail');
    return ordersForAccount(email);
  }, [isAccountOpen, items]);

  // --- EFFECTS ---
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  /**
   * After checkout, CheckoutSuccess sets `clear_cart_after_checkout`.
   * We must handle that **before** hydrating from the server, or an old server cart would reappear.
   */
  useEffect(() => {
    const email = localStorage.getItem('accountEmail');

    if (sessionStorage.getItem('clear_cart_after_checkout') === '1') {
      sessionStorage.removeItem('clear_cart_after_checkout');
      setCart([]);
      cartSaveReadyRef.current = true;
      if (email) void saveCartToServer(email, []).catch(() => {});
      return;
    }

    if (!email) {
      cartSaveReadyRef.current = true;
      return;
    }

    let cancelled = false;
    cartSaveReadyRef.current = false;
    (async () => {
      try {
        const serverCart = await fetchCartFromServer(email);
        if (!cancelled) setCart(serverCart);
      } catch {
        /* keep local cart */
      } finally {
        if (!cancelled) cartSaveReadyRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Debounced save of cart to SQLite (per email) for cross-device continuity. */
  useEffect(() => {
    if (!cartSaveReadyRef.current) return;
    const email = localStorage.getItem('accountEmail');
    if (!email) return;
    const t = window.setTimeout(() => {
      void saveCartToServer(email, cart).catch(() => {});
    }, 600);
    return () => window.clearTimeout(t);
  }, [cart]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dashRef.current && !dashRef.current.contains(target)) setIsDashOpen(false);
      if (cartRef.current && !cartRef.current.contains(target)) setIsCartOpen(false);
      if (accountRef.current && !accountRef.current.contains(target)) setIsAccountOpen(false);
      // Close search suggestions when clicking anywhere outside the search bar + dropdown
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) setSearchSuggestOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen transition-colors duration-500 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white p-6 font-sans">
      
      {/* --- CENTERED NAVIGATION UNIT --- */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 w-full max-w-2xl px-4">
        
        {/* DASHBOARD (LEFT) */}
        <div className="relative" ref={dashRef}>
          <button onClick={() => setIsDashOpen(!isDashOpen)} className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full shadow-md transition-all active:scale-90 border ${isDashOpen ? 'bg-sky-500 border-sky-600 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </button>
          {isDashOpen && (
            <form onSubmit={handleAddItem} className="absolute left-0 mt-3 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 animate-in fade-in zoom-in duration-200">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Create Item</p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="create-produce" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Produce</label>
                  {/* Preset-only names reduce typos; onChange seeds unit price to the fair default. */}
                  <select
                    id="create-produce"
                    required
                    value={newItem.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const bounds = PRODUCE_PRICING[name];
                      setNewItem({
                        ...newItem,
                        name,
                        price: bounds ? bounds.fair.toFixed(2) : '',
                      });
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg outline-none border border-transparent focus:border-sky-500"
                  >
                    <option value="" disabled>Choose a fruit or vegetable…</option>
                    <optgroup label="Vegetables">
                      {PRESET_VEGETABLES.map((label) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Fruits">
                      {PRESET_FRUITS.map((label) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                {/* Bounded slider: user cannot type arbitrary prices, only pick within min–max for this produce. */}
                {createPriceBounds && createPriceSliderValue !== null && (
                    <div>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <label htmlFor="create-price-range" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Unit price (within allowed range)</label>
                        <span className="text-sm font-black text-sky-600 dark:text-sky-400 tabular-nums">£{createPriceSliderValue.toFixed(2)}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                        Fair default <span className="font-semibold text-slate-600 dark:text-slate-300">£{createPriceBounds.fair.toFixed(2)}</span>
                        {' · '}you may set <span className="font-semibold">£{createPriceBounds.min.toFixed(2)}</span>
                        {' – '}
                        <span className="font-semibold">£{createPriceBounds.max.toFixed(2)}</span>
                      </p>
                      <input
                        id="create-price-range"
                        type="range"
                        min={createPriceBounds.min}
                        max={createPriceBounds.max}
                        step={0.01}
                        value={createPriceSliderValue}
                        onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                        className="w-full h-2 accent-sky-500 rounded-full cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-medium tabular-nums">
                        <span>£{createPriceBounds.min.toFixed(2)}</span>
                        <span>£{createPriceBounds.max.toFixed(2)}</span>
                      </div>
                    </div>
                )}
                {/* --- Traceability + availability (new listing) — shown on product cards for transparency --- */}
                <div>
                  <label htmlFor="create-stock" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Stock (units available)</label>
                  <input
                    id="create-stock"
                    required
                    type="number"
                    min={0}
                    max={99999}
                    step={1}
                    value={newItem.stockUnits}
                    onChange={(e) => setNewItem({ ...newItem, stockUnits: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg outline-none border border-transparent focus:border-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor="create-supplier" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Supplier / grower</label>
                  <input
                    id="create-supplier"
                    type="text"
                    value={newItem.supplier}
                    onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg outline-none border border-transparent focus:border-sky-500"
                  />
                </div>
                {/* Auto lot: global sequence + date + product segment — see `lotNumber.ts` (scales to large catalogs). */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Lot / batch ID</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{describeLotIdFormat(newItem.name)}</p>
                </div>
                {/* Auto pack date: local YYYY-MM-DD at save time (same calendar day as lot id); no manual picker. */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Pack date</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    Set automatically to <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{packDateYmdLocal()}</span> when you add to the gallery (local date, aligned with the lot id).
                  </p>
                </div>
                <button type="submit" className="w-full py-2 bg-sky-500 text-white text-sm font-bold rounded-lg hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/20">Add to Gallery</button>
              </div>
            </form>
          )}
        </div>

        {/* SEARCH (CENTER): filters gallery via filteredItems; suggestions from searchSuggestions */}
        <div className="relative flex-grow z-40" ref={searchWrapRef}>
          <input
            type="search"
            role="combobox"
            aria-expanded={searchSuggestOpen && Boolean(searchQuery.trim())}
            aria-autocomplete="list"
            aria-controls="search-suggest-list"
            autoComplete="off"
            placeholder="Search items…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchSuggestOpen(true);
            }}
            onFocus={() => setSearchSuggestOpen(true)}
            className="w-full py-2.5 pl-11 pr-4 rounded-full outline-none transition-all bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md focus:ring-2 focus:ring-sky-500/50"
          />
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          {/* Predictive dropdown; mousedown preventDefault on options avoids blur-before-click issues */}
          {searchSuggestOpen && searchQuery.trim() && (
            <ul
              id="search-suggest-list"
              role="listbox"
              className="absolute left-0 right-0 top-full mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1 text-sm"
            >
              {searchSuggestions.length === 0 ? (
                <li className="px-4 py-3 text-slate-500 italic">No matching produce names</li>
              ) : (
                searchSuggestions.map(({ name, inGallery }) => (
                  <li key={name} role="presentation">
                    <button
                      type="button"
                      role="option"
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 transition-colors"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        setSearchQuery(name);
                        setSearchSuggestOpen(false);
                      }}
                    >
                      <span className="font-medium truncate">{name}</span>
                      <span className={`shrink-0 text-[10px] uppercase font-bold tracking-wider ${inGallery ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {inGallery ? 'In gallery' : 'Catalog'}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* CART (RIGHT): line totals here; "Secure checkout" persists snapshot and navigates to /checkout */}
        <div className="relative" ref={cartRef}>
          <button
            type="button"
            onClick={() => setIsCartOpen(!isCartOpen)}
            className={`relative flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full shadow-md transition-all active:scale-90 border ${isCartOpen ? 'bg-sky-500 border-sky-600 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'}`}
            aria-label={`Shopping cart${cartItemCount > 0 ? `, ${cartItemCount} items` : ''}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
            {/* Badge = sum of quantities across lines (total units in cart). */}
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none">
                {cartItemCount > 99 ? '99+' : cartItemCount}
              </span>
            )}
          </button>
          {isCartOpen && (
            <div className="absolute right-0 mt-3 w-72 max-h-[min(24rem,calc(100vh-8rem))] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 animate-in fade-in zoom-in duration-200">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3 shrink-0">Your Cart</p>
              {cart.length === 0 ? (
                <p className="text-center py-4 text-sm text-slate-500 italic">Cart is empty</p>
              ) : (
                <>
                  <ul className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1 -mr-1">
                    {cart.map((line) => (
                      <li
                        key={line.id}
                        className="flex gap-2 items-start rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{line.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span className="font-medium text-slate-600 dark:text-slate-300">{line.quantity}</span>
                            {' × '}
                            <span className="tabular-nums">£{line.unitPrice}</span>
                            <span className="text-slate-400"> / unit</span>
                            <span className="text-sky-600 dark:text-sky-400 font-semibold ml-1 tabular-nums">£{cartLineTotal(line).toFixed(2)}</span>
                            <span className="text-slate-400 font-normal"> line</span>
                          </p>
                          {/* Traceability snapshot on cart line (same data stored on the order after checkout). */}
                          <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                            {line.supplier} · Lot {line.lotId}
                            {line.packedOn ? ` · Packed ${line.packedOn}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCartLine(line.id)}
                          className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                          aria-label={`Remove ${line.name} from cart`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total</span>
                    <span className="text-lg font-black text-sky-500">£{cartGrandTotal.toFixed(2)}</span>
                  </div>
                  {/* Stripe handoff: save cart for cancel recovery + pass state to Checkout route */}
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
                        total: cartGrandTotal.toFixed(2),
                      };
                      sessionStorage.setItem('checkout_cart', JSON.stringify(snapshot));
                      setIsCartOpen(false);
                      navigate('/checkout', { state: snapshot });
                    }}
                    className="mt-3 w-full py-2.5 rounded-xl bg-sky-500 text-white text-sm font-bold hover:bg-sky-600 transition-colors shadow-md shadow-sky-500/25"
                  >
                    Secure checkout
                  </button>
                  <p className="mt-2 text-[10px] text-center text-slate-500 leading-snug">
                    You will pay on Stripe&apos;s secure page. Card details are never stored in this app.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- SETTINGS/ACCOUNT (FAR RIGHT) --- */}
      <div className="fixed top-6 right-6 z-50" ref={accountRef}>
        <button onClick={() => setIsAccountOpen(!isAccountOpen)} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 pr-4 rounded-full shadow-md hover:shadow-lg transition-all active:scale-95">
          <div className="w-8 h-8 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] tracking-tighter">GLH</div>
          <span className="text-sm font-semibold hidden lg:inline">Account</span>
        </button>

        {isAccountOpen && (
          <div className="absolute right-0 mt-2 w-80 max-h-[min(28rem,85vh)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 animate-in fade-in zoom-in duration-200">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-2 mb-3">Appearance</p>
            <div className="relative flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-2">
               <div className={`absolute h-[calc(100%-8px)] w-[calc(50%-4px)] bg-white dark:bg-slate-600 rounded-lg shadow-sm transition-transform duration-300 ease-out ${isDark ? 'translate-x-full' : 'translate-x-0'}`} />
              <button onClick={() => setIsDark(false)} className={`relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors ${!isDark ? 'text-sky-600 dark:text-white' : 'text-slate-500'}`}>Light</button>
              <button onClick={() => setIsDark(true)} className={`relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors ${isDark ? 'text-sky-600 dark:text-white' : 'text-slate-500'}`}>Dark</button>
            </div>
            {/* --- Order history: completed orders from localStorage, filtered by accountEmail after login --- */}
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2 mx-1" />
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-2 mb-2">Order history</p>
            {accountOrders.length === 0 ? (
              <p className="px-2 pb-2 text-xs text-slate-500">No orders yet. Complete checkout to see them here.</p>
            ) : (
              <ul className="space-y-2 px-1 pb-2 max-h-48 overflow-y-auto">
                {accountOrders.map((ord) => (
                  <li
                    key={ord.id}
                    className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-2 text-[11px]"
                  >
                    <div className="flex justify-between gap-2 font-semibold text-slate-800 dark:text-slate-100">
                      <span className="truncate">{new Date(ord.placedAt).toLocaleString()}</span>
                      <span className="tabular-nums text-sky-600 dark:text-sky-400 shrink-0">£{ord.total}</span>
                    </div>
                    <p className="text-slate-500 mt-0.5">
                      {ord.fulfillment === 'delivery' ? 'Delivery' : 'Collection'} · {ord.source === 'demo' ? 'Demo' : 'Paid'}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                      {ord.lines.map((ln, idx) => (
                        <li key={`${ord.id}-${idx}`} className="truncate">
                          {ln.name} ×{ln.quantity} @ £{ln.unitPrice}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2 mx-1" />
            <button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('accountEmail'); navigate('/'); }} className="w-full text-left px-3 py-2 text-sm text-red-500 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors">Sign Out</button>
          </div>
        )}
      </div>

      {/* --- ITEM GALLERY: uses filteredItems when searching; each card has per-listing qty draft for add-to-cart --- */}
      <div className="mt-32 max-w-6xl mx-auto px-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <div className="w-20 h-20 border-2 border-dashed border-slate-400 rounded-full mb-4 flex items-center justify-center text-3xl font-light text-slate-400">+</div>
            <p className="font-medium text-slate-500 italic">Dashboard is empty. Click the plus to begin.</p>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Non-empty gallery but nothing matches the current search tokens */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-medium text-slate-600 dark:text-slate-300">No listings match &ldquo;{searchQuery.trim()}&rdquo;</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-4 text-sm font-semibold text-sky-600 dark:text-sky-400 hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {filteredItems.map((item) => {
              const qtyDraft = qtyToAddByListingId[item.id] ?? '1';
              const inCartQty = cart.filter((l) => l.listingId === item.id).reduce((s, l) => s + l.quantity, 0);
              const remaining = Math.max(0, item.stockUnits - inCartQty);
              const maxPick = Math.max(1, remaining);
              const stockLabel =
                item.stockUnits <= 0
                  ? 'Out of stock'
                  : remaining <= 3
                    ? `Low stock (${remaining} left)`
                    : `In stock (${item.stockUnits} units)`;
              return (
              <div key={item.id} className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm hover:shadow-xl transition-all duration-300">
                <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4 flex items-center justify-center text-4xl relative">
                  📦
                  {/* Transparent availability badge */}
                  <span
                    className={`absolute bottom-2 left-2 right-2 text-center text-[10px] font-bold uppercase tracking-wider rounded-lg py-1 ${
                      item.stockUnits <= 0
                        ? 'bg-red-500/90 text-white'
                        : remaining <= 3
                          ? 'bg-amber-500/90 text-slate-900'
                          : 'bg-emerald-600/90 text-white'
                    }`}
                  >
                    {stockLabel}
                  </span>
                </div>
                <h3 className="font-bold text-lg">{item.name}</h3>
                {/* Transparent unit pricing */}
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">£{item.price}</span>
                  <span> per unit · </span>
                  <span className="text-slate-600 dark:text-slate-300">{remaining} available to add</span>
                </p>
                {/* Product traceability (supplier, lot, pack date) */}
                <div className="mt-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 p-2.5 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                  <p className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 mb-1">Traceability</p>
                  <p><span className="font-semibold text-slate-700 dark:text-slate-300">Supplier:</span> {item.supplier}</p>
                  <p><span className="font-semibold text-slate-700 dark:text-slate-300">Lot:</span> {item.lotId}</p>
                  {item.packedOn && (
                    <p><span className="font-semibold text-slate-700 dark:text-slate-300">Pack date:</span> {item.packedOn}</p>
                  )}
                </div>
                <div className="mt-3">
                  <label htmlFor={`qty-add-${item.id}`} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Quantity to add</label>
                  <input
                    id={`qty-add-${item.id}`}
                    type="number"
                    min={1}
                    max={maxPick}
                    step={1}
                    value={qtyDraft}
                    onChange={(e) =>
                      setQtyToAddByListingId((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    disabled={remaining < 1}
                    className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg outline-none border border-transparent focus:border-sky-500 tabular-nums disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddToCart(item)}
                  disabled={remaining < 1}
                  className="mt-3 w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-all active:scale-95 hover:bg-sky-100 dark:hover:bg-sky-900/40 disabled:opacity-40 disabled:cursor-not-allowed px-3"
                >
                  {remaining < 1 ? 'Unavailable' : 'Add to Cart'}
                </button>
                {listingCreatedByCurrentAccount(item) && (
                  <button
                    type="button"
                    onClick={() => void handleRemoveListing(item)}
                    className="mt-3 w-full min-h-[44px] rounded-xl border-2 border-red-500/55 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 shadow-sm transition-colors hover:border-red-600 hover:bg-red-100 active:scale-[0.99] dark:border-red-500/50 dark:bg-red-950/35 dark:text-red-100 dark:hover:bg-red-900/45"
                    aria-label={`Remove ${item.name} from gallery`}
                  >
                    Remove listing
                  </button>
                )}
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}