/**
 * Shared TypeScript types for the checkout flow.
 * The cart is serialized into these shapes before navigating to /checkout
 * or saving to sessionStorage (so returning from Stripe cancel still works).
 */

/** One row sent to the server to build a Stripe line item (name + qty + unit price string). */
export interface CheckoutLinePayload {
  /** Display / product name shown on Stripe Checkout and receipts. */
  name: string;
  /** How many units of this product the customer is buying. */
  quantity: number;
  /** Unit price in GBP as a decimal string (e.g. "1.99"); server converts to pence for Stripe. */
  unitPrice: string;
  /** Gallery listing id — used client-side after payment to decrement stock (ignored by Stripe API). */
  listingId?: number;
  /** Traceability snapshot copied from the listing (ignored by Stripe; stored in order history). */
  supplier?: string;
  lotId?: string;
  packedOn?: string;
}

/**
 * Full cart snapshot passed through React Router state and sessionStorage.
 * The server recomputes money from `lines`; `total` is only for display consistency.
 */
export interface CheckoutCartSnapshot {
  /** Line items the backend validates and turns into Stripe Checkout line_items. */
  lines: CheckoutLinePayload[];
  /** Precomputed cart total string for UI; never trusted alone for charging. */
  total: string;
}
