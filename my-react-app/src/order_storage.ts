import type { CheckoutCartSnapshot, CheckoutLinePayload } from './checkout_types.ts';
import type { FulfillmentMethod, OrderRecord, ProduceListing, ShopCartLine } from './shop_types.ts';

//These constants are used to store and retreived data from the backend databse.
const gallery_key = 'produce_catalog_gallery_v1';
const orders_key = 'produce_account_orders_v1';
const profiles_key = 'produce_account_profiles_v1';
const purchase_events_key = 'produce_purchase_events_v1';

export const pending_checkout_key = 'item_pending_checkout';
export const checkout_recorded_key = 'checkout_order_saved';

export const loyalty_purchases_per_reward = 30;
export const loyalty_min_subtotal_gbp = 5;
export const loyalty_discount_fraction = 0.3;

export interface AccountProfile {
  displayName: string;
  addressLine: string;
  postcode: string;
}

export interface PendingCheckout extends CheckoutCartSnapshot {
  fulfillment: FulfillmentMethod;
  customerEmail: string | null;
  buyerName: string;
  addressLine: string;
  postcode: string;
  loyaltyDiscountApplied: boolean;
  subtotalBeforeDiscount: string;
}

export interface PurchaseEvent {
  orderId: string;
  placedAt: string;
  buyerName: string;
  addressLine: string;
  postcode: string;
  buyerEmail: string | null;
  sellerEmail: string;
  listingId: number;
  productName: string;
  quantity: number;
}

//These funtions are used to retreive and load data for the users viewing while also acting as a verification step to make sure the data displayed is not unredable ir broken.
function parse_listing(raw: unknown): ProduceListing | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = Number(o.id);
  const name = typeof o.name === 'string' ? o.name : '';
  if (!Number.isFinite(id) || !name) return null;
  const price = typeof o.price === 'string' ? o.price : Number(o.price).toFixed(2);
  const stock_raw = Number(o.stockUnits);
  const stock_units =
    Number.isFinite(stock_raw) && stock_raw >= 0 ? Math.min(99999, Math.floor(stock_raw)) : 48;
  const created_raw = o.createdByEmail ?? o.created_by_email;
  const created_by_email =
    typeof created_raw === 'string' && created_raw.trim() !== ''
      ? created_raw.trim().toLowerCase()
      : null;
  return {
    id,
    name,
    price,
    stockUnits: stock_units,
    supplier: typeof o.supplier === 'string' && o.supplier ? o.supplier : 'Supplier not recorded',
    lotId: typeof o.lotId === 'string' && o.lotId ? o.lotId : '—',
    packedOn: typeof o.packedOn === 'string' ? o.packedOn : '',
    createdByEmail: created_by_email,
  };
}

export function load_catalog(): ProduceListing[] {
  try {
    const raw = localStorage.getItem(gallery_key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map(parse_listing).filter((x): x is ProduceListing => x !== null);
  } catch {
    return [];
  }
}

export function save_catalog(items: ProduceListing[]): void {
  localStorage.setItem(gallery_key, JSON.stringify(items));
}

export function load_account_profile(email: string | null): AccountProfile {
  const defaults: AccountProfile = { displayName: '', addressLine: '', postcode: '' };
  if (!email) return defaults;
  try {
    const raw = localStorage.getItem(profiles_key);
    if (!raw) return defaults;
    const o = JSON.parse(raw) as Record<string, Partial<AccountProfile>>;
    const row = o[email.trim().toLowerCase()];
    if (!row || typeof row !== 'object') return defaults;
    return {
      displayName: typeof row.displayName === 'string' ? row.displayName : '',
      addressLine: typeof row.addressLine === 'string' ? row.addressLine : '',
      postcode: typeof row.postcode === 'string' ? row.postcode : '',
    };
  } catch {
    return defaults;
  }
}

export function save_account_profile(email: string, patch: Partial<AccountProfile>): void {
  if (!email?.trim()) return;
  const e = email.trim().toLowerCase();
  const cur = load_account_profile(email);
  const next: AccountProfile = { ...cur, ...patch };
  try {
    const raw = localStorage.getItem(profiles_key);
    const all: Record<string, AccountProfile> = raw ? (JSON.parse(raw) as Record<string, AccountProfile>) : {};
    all[e] = next;
    localStorage.setItem(profiles_key, JSON.stringify(all));
  } catch {
    localStorage.setItem(profiles_key, JSON.stringify({ [e]: next }));
  }
}

//This function creates a key for each user cart and uses it as a saving point so user doesnt lose their items.
function cart_storage_key(email: string | null): string {
  if (!email?.trim()) return 'produce_cart_guest_v1';
  return `produce_cart_${email.trim().toLowerCase()}_v1`;
}

export function load_cart(email: string | null): ShopCartLine[] {
  try {
    const raw = localStorage.getItem(cart_storage_key(email));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((line): line is ShopCartLine => {
      if (!line || typeof line !== 'object') return false;
      const l = line as ShopCartLine;
      return Number.isFinite(l.id) && Number.isFinite(l.listingId) && typeof l.name === 'string';
    });
  } catch {
    return [];
  }
}

export function save_cart(email: string | null, cart: ShopCartLine[]): void {
  localStorage.setItem(cart_storage_key(email), JSON.stringify(cart));
}

//this function is used to verify if the data retrieved from the backend is in the correct format.
function normalize_order(raw: unknown): OrderRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !Array.isArray(r.lines)) return null;
  return {
    id: r.id,
    placedAt: typeof r.placedAt === 'string' ? r.placedAt : new Date().toISOString(),
    fulfillment: r.fulfillment === 'delivery' ? 'delivery' : 'collection',
    total: typeof r.total === 'string' ? r.total : String(r.total ?? '0'),
    lines: r.lines as OrderRecord['lines'],
    source: 'local',
    customerEmail: typeof r.customerEmail === 'string' ? r.customerEmail : null,
    buyerName: typeof r.buyerName === 'string' ? r.buyerName : '',
    addressLine: typeof r.addressLine === 'string' ? r.addressLine : '',
    postcode: typeof r.postcode === 'string' ? r.postcode : '',
    loyaltyDiscountApplied: Boolean(r.loyaltyDiscountApplied),
    subtotalBeforeDiscount:
      typeof r.subtotalBeforeDiscount === 'string' ? r.subtotalBeforeDiscount : String(r.total ?? '0'),
  };
}

export function load_orders(): OrderRecord[] {
  try {
    const raw = localStorage.getItem(orders_key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map(normalize_order).filter((o): o is OrderRecord => o !== null);
  } catch {
    return [];
  }
}

//This functions saves the order history of the user so ty can refer to it later on.
function save_orders(orders: OrderRecord[]): void {
  localStorage.setItem(orders_key, JSON.stringify(orders.slice(0, 200)));
}

//This functions is used by the seller to view who has bought their produce.
function load_purchase_events(): PurchaseEvent[] {
  try {
    const raw = localStorage.getItem(purchase_events_key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((ev): ev is PurchaseEvent => {
      if (!ev || typeof ev !== 'object') return false;
      const e = ev as PurchaseEvent;
      return typeof e.orderId === 'string' && typeof e.sellerEmail === 'string';
    });
  } catch {
    return [];
  }
}

//This functions stores user purchases as (purchase events) so it be referred to later.
function save_purchase_events(events: PurchaseEvent[]): void {
  localStorage.setItem(purchase_events_key, JSON.stringify(events.slice(0, 2000)));
}

export function get_purchase_events_for_seller(seller_email: string | null): PurchaseEvent[] {
  const e = seller_email?.trim().toLowerCase();
  if (!e) return [];
  return load_purchase_events().filter((ev) => ev.sellerEmail.toLowerCase() === e);
}

export function save_pending_checkout(payload: PendingCheckout): void {
  sessionStorage.removeItem(checkout_recorded_key);
  sessionStorage.setItem(pending_checkout_key, JSON.stringify(payload));
}

export function read_pending_checkout(): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(pending_checkout_key);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingCheckout;
    if (!p || !Array.isArray(p.lines)) return null;
    return p;
  } catch {
    return null;
  }
}

export function clear_pending_checkout(): void {
  sessionStorage.removeItem(pending_checkout_key);
}

//This function is used to covert the checkouts to orders so the seller can view the the order.
function to_order_lines(lines: CheckoutLinePayload[]): OrderRecord['lines'] {
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

export function completed_order_count_for_customer(email: string | null): number {
  if (!email?.trim()) return 0;
  const e = email.trim().toLowerCase();
  return load_orders().filter((o) => o.customerEmail?.toLowerCase() === e).length;
}

export function orders_until_next_loyalty_reward(completed_count: number): number {
  if (completed_count <= 0) return loyalty_purchases_per_reward;
  const next_milestone =
    Math.ceil(completed_count / loyalty_purchases_per_reward) * loyalty_purchases_per_reward;
  return Math.max(0, next_milestone - completed_count);
}

export function will_next_order_earn_loyalty_discount(completed_count_before: number): boolean {
  return (completed_count_before + 1) % loyalty_purchases_per_reward === 0;
}

export function loyalty_discount_applies(subtotal: number, completed_count_before: number): boolean {
  return will_next_order_earn_loyalty_discount(completed_count_before) && subtotal > loyalty_min_subtotal_gbp;
}

export function price_after_loyalty(subtotal: number, completed_count_before: number): number {
  if (!loyalty_discount_applies(subtotal, completed_count_before)) return subtotal;
  return Math.round(subtotal * (1 - loyalty_discount_fraction) * 100) / 100;
}

export function record_completed_order(pending: PendingCheckout): OrderRecord {
  const sub_num = Number.parseFloat(pending.subtotalBeforeDiscount);
  const subtotal_safe = Number.isFinite(sub_num) ? sub_num : Number.parseFloat(pending.total);

  const record: OrderRecord = {
    id: `ord_${Date.now()}`,
    placedAt: new Date().toISOString(),
    fulfillment: pending.fulfillment,
    total: pending.total,
    lines: to_order_lines(pending.lines),
    source: 'local',
    customerEmail: pending.customerEmail,
    buyerName: pending.buyerName,
    addressLine: pending.addressLine,
    postcode: pending.postcode,
    loyaltyDiscountApplied: pending.loyaltyDiscountApplied,
    subtotalBeforeDiscount: subtotal_safe.toFixed(2),
  };

  const catalog = load_catalog();
  const by_id = new Map(catalog.map((it) => [it.id, { ...it }]));
  for (const line of pending.lines) {
    const lid = line.listingId;
    if (lid === undefined || !Number.isFinite(lid)) continue;
    const row = by_id.get(lid);
    if (!row) continue;
    row.stockUnits = Math.max(0, row.stockUnits - line.quantity);
    by_id.set(lid, row);
  }
  save_catalog([...by_id.values()]);

  
  const orders = load_orders();
  orders.unshift(record);
  save_orders(orders);

  const new_events: PurchaseEvent[] = [];
  for (const line of pending.lines) {
    const lid = line.listingId;
    if (lid === undefined || !Number.isFinite(lid)) continue;
    const item = catalog.find((i) => i.id === lid);
    const seller = item?.createdByEmail?.trim().toLowerCase();
    if (!seller) continue;
    new_events.push({
      orderId: record.id,
      placedAt: record.placedAt,
      buyerName: pending.buyerName,
      addressLine: pending.addressLine,
      postcode: pending.postcode,
      buyerEmail: pending.customerEmail,
      sellerEmail: seller,
      listingId: lid,
      productName: line.name,
      quantity: line.quantity,
    });
  }
  if (new_events.length > 0) {
    save_purchase_events([...new_events, ...load_purchase_events()]);
  }

  clear_pending_checkout();

  return record;
}

export function orders_for_account(email: string | null): OrderRecord[] {
  const all = load_orders();
  const e = email?.trim().toLowerCase();
  if (!e) return all;
  return all.filter((o) => !o.customerEmail || o.customerEmail.toLowerCase() === e);
}
