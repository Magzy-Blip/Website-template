/**
 * Client-side persistence for catalog + order history + pending checkout.
 * Used so inventory and orders survive refresh and tie to the logged-in email when set.
 */
import type { CheckoutCartSnapshot, CheckoutLinePayload } from './checkoutTypes';
import type { FulfillmentMethod, OrderRecord, ProduceListing } from './shopTypes';

/** localStorage key for serialized gallery (ProduceListing[]). */
const GALLERY_KEY = 'produce_catalog_gallery_v1';

/** localStorage key for completed orders (OrderRecord[]), newest first. */
const ORDERS_KEY = 'produce_account_orders_v1';

/** sessionStorage: cart + fulfillment saved right before Stripe redirect or demo completion. */
export const PENDING_CHECKOUT_KEY = 'produce_pending_checkout_v1';

/** Prevents duplicate order rows if the user refreshes the thank-you page. */
export const CHECKOUT_RECORDED_KEY = 'checkout_order_recorded_v1';

/** Shape written by Checkout and read by CheckoutSuccess after payment. */
export interface PendingCheckout extends CheckoutCartSnapshot {
  fulfillment: FulfillmentMethod;
  customerEmail: string | null;
}

/** Normalize legacy / partial JSON into a full ProduceListing (defaults for missing trace fields). */
function parseListing(raw: unknown): ProduceListing | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = Number(o.id);
  const name = typeof o.name === 'string' ? o.name : '';
  if (!Number.isFinite(id) || !name) return null;
  const price = typeof o.price === 'string' ? o.price : Number(o.price).toFixed(2);
  const stockRaw = Number(o.stockUnits);
  const stockUnits = Number.isFinite(stockRaw) && stockRaw >= 0 ? Math.min(99999, Math.floor(stockRaw)) : 48;
  const createdRaw = o.createdByEmail ?? o.created_by_email;
  const createdByEmail =
    typeof createdRaw === 'string' && createdRaw.trim() !== ''
      ? createdRaw.trim().toLowerCase()
      : null;
  return {
    id,
    name,
    price,
    stockUnits,
    supplier: typeof o.supplier === 'string' && o.supplier ? o.supplier : 'Supplier not recorded',
    lotId: typeof o.lotId === 'string' && o.lotId ? o.lotId : '—',
    packedOn: typeof o.packedOn === 'string' ? o.packedOn : '',
    createdByEmail,
  };
}

/** Load all gallery listings from localStorage (empty array if missing or corrupt). */
export function loadCatalog(): ProduceListing[] {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map(parseListing).filter((x): x is ProduceListing => x !== null);
  } catch {
    return [];
  }
}

/** Persist the entire gallery whenever listings change (prices, stock, trace fields). */
export function saveCatalog(items: ProduceListing[]): void {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
}

/** Read order history (newest orders appear first in the stored array). */
export function loadOrders(): OrderRecord[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((o): o is OrderRecord => {
      if (!o || typeof o !== 'object') return false;
      const r = o as OrderRecord;
      return typeof r.id === 'string' && Array.isArray(r.lines);
    });
  } catch {
    return [];
  }
}

function saveOrders(orders: OrderRecord[]): void {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 200)));
}

/** Store checkout payload before leaving the SPA for Stripe (or before demo thank-you). */
export function savePendingCheckout(payload: PendingCheckout): void {
  sessionStorage.removeItem(CHECKOUT_RECORDED_KEY);
  sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(payload));
}

/** Read pending checkout without removing (used after payment to decide whether to finalize). */
export function readPendingCheckout(): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingCheckout;
    if (!p || !Array.isArray(p.lines)) return null;
    return p;
  } catch {
    return null;
  }
}

/** Remove pending checkout from sessionStorage (after order is recorded or abandoned). */
export function clearPendingCheckout(): void {
  sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
}

/** Convert checkout lines into order history lines (drops fields Stripe does not need). */
function toOrderLines(lines: CheckoutLinePayload[]): OrderRecord['lines'] {
  return lines.map((l) => ({
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    listingId: l.listingId,
    supplier: l.supplier,
    lotId: l.lotId,
    packedOn: l.packedOn,
  }));
}

/**
 * After a successful payment (or demo): append an OrderRecord and subtract sold quantities
 * from matching listings in the saved catalog (by listingId when present).
 */
export function recordCompletedOrder(pending: PendingCheckout, source: 'stripe' | 'demo'): OrderRecord {
  const record: OrderRecord = {
    id: `ord_${Date.now()}`,
    placedAt: new Date().toISOString(),
    fulfillment: pending.fulfillment,
    total: pending.total,
    lines: toOrderLines(pending.lines),
    source,
    customerEmail: pending.customerEmail,
  };

  const catalog = loadCatalog();
  const byId = new Map(catalog.map((it) => [it.id, { ...it }]));
  for (const line of pending.lines) {
    const lid = line.listingId;
    if (lid === undefined || !Number.isFinite(lid)) continue;
    const row = byId.get(lid);
    if (!row) continue;
    row.stockUnits = Math.max(0, row.stockUnits - line.quantity);
    byId.set(lid, row);
  }
  saveCatalog([...byId.values()]);

  const orders = loadOrders();
  orders.unshift(record);
  saveOrders(orders);

  clearPendingCheckout();

  return record;
}

/** Orders visible for “my account” — match email when logged in, else show all stored device orders. */
export function ordersForAccount(email: string | null): OrderRecord[] {
  const all = loadOrders();
  const e = email?.trim().toLowerCase();
  if (!e) return all;
  return all.filter((o) => !o.customerEmail || o.customerEmail.toLowerCase() === e);
}
