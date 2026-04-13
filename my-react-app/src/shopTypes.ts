/**
 * Shop domain types: catalog listings with traceability + stock,
 * cart lines carrying trace snapshots, orders, and fulfillment choice.
 */

/** How the customer will receive the order after payment. */
export type FulfillmentMethod = 'collection' | 'delivery';

/**
 * One sellable listing in the gallery — transparent unit price and live availability.
 * Traceability fields support audits: supplier, lot/batch, pack date.
 */
export interface ProduceListing {
  id: number;
  name: string;
  /** Unit price in GBP (string for consistent formatting with sliders / inputs). */
  price: string;
  /** Set when the listing is saved on the server — only this account may delete the listing. */
  createdByEmail?: string | null;
  /** Units in stock; shown on the card and enforced when adding to cart / at checkout finalization. */
  stockUnits: number;
  /** Grower, co-op, or distributor name for product traceability. */
  supplier: string;
  /** Batch / lot code — use `getNextLotId` from `lotNumber.ts` (global date + sequence + product segment). */
  lotId: string;
  /** Pack date `YYYY-MM-DD` — set automatically at listing time via `packDateYmdLocal()` in `lotNumber.ts`. */
  packedOn: string;
}

/** Shopping-cart row: includes listingId for inventory updates after purchase. */
export interface ShopCartLine {
  id: number;
  listingId: number;
  name: string;
  unitPrice: string;
  quantity: number;
  /** Copied from the listing at add-to-cart time so receipts / order history stay accurate. */
  supplier: string;
  lotId: string;
  packedOn: string;
}

/** Persisted row in the account order history list. */
export interface OrderLineRecord {
  name: string;
  quantity: number;
  unitPrice: string;
  listingId?: number;
  supplier?: string;
  lotId?: string;
  packedOn?: string;
}

/** One completed purchase (stored in localStorage per browser / account email). */
export interface OrderRecord {
  id: string;
  placedAt: string;
  fulfillment: FulfillmentMethod;
  total: string;
  lines: OrderLineRecord[];
  source: 'stripe' | 'demo';
  /** Email from login; used to filter “my orders” in the account panel. */
  customerEmail: string | null;
}
