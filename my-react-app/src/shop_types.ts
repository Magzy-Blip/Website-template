export type FulfillmentMethod = 'collection' | 'delivery';
//these defining structure create the data representation the user sees in the website from the prices and quanitities to supplier and lotnumber.
export interface ProduceListing {
  id: number;
  name: string;
  price: string;
  createdByEmail?: string | null;
  stockUnits: number;
  supplier: string;
  lotId: string;
  packedOn: string;
}


export interface ShopCartLine {
  id: number;
  listingId: number;
  name: string;
  unitPrice: string;
  quantity: number;
  
  supplier: string;
  lotId: string;
  packedOn: string;
}


export interface OrderLineRecord {
  name: string;
  quantity: number;
  unitPrice: string;
  listingId?: number;
  supplier?: string;
  lotId?: string;
  packedOn?: string;
}


export interface OrderRecord {
  id: string;
  placedAt: string;
  fulfillment: FulfillmentMethod;
  total: string;
  lines: OrderLineRecord[];
  source: 'local';
  customerEmail: string | null;
  buyerName: string;
  addressLine: string;
  postcode: string;
  loyaltyDiscountApplied: boolean;
  subtotalBeforeDiscount: string;
}
