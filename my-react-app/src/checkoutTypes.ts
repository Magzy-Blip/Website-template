/** One row sent to the server */
export interface CheckoutLinePayload {
  /** Display / product name shown on Stripe Checkout and receipts. */
  name: string;
  /** How many units of this product are being bought by the customer. */
  quantity: number;
  /** Unit price in GBP as a decimal string. */
  unitPrice: string;
  /** Gallery listing used client side after payment */
  listingId?: number;
  // Traceability snapshot copied from the listing 
  supplier?: string;
  lotId?: string;
  packedOn?: string;
}

/**
 * Full cart snapshot passed through React Router state and sessionStorage.
 * The server recomputes money from `lines`; `total` is only for display consistency.
 */
export interface CheckoutCartSnapshot {
  //Line items the backend validates and turns into Stripe Checkout. 
  lines: CheckoutLinePayload[];
  //method chosen by user for checkout not saved in the the purchase history.
  total: string;
}
