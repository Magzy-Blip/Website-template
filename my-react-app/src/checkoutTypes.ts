export interface CheckoutLinePayload {
  name: string;
  quantity: number;
  unitPrice: string;
  listingId?: number;
  supplier?: string;
  lotId?: string;
  packedOn?: string;
}

export interface CheckoutCartSnapshot {
  lines: CheckoutLinePayload[];
  total: string;
}
