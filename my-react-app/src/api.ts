import type { ProduceListing, ShopCartLine } from './shopTypes';

export const API_BASE = 'http://localhost:5000';

function parseListingRow(row: Record<string, unknown>): ProduceListing | null {
  const id = Number(row.id);
  const name = String(row.name ?? '');
  if (!Number.isFinite(id) || !name) return null;
  const price = String(row.price ?? '0');
  const stockUnits = Math.max(0, Math.floor(Number(row.stockUnits) || 0));
  const createdRaw = row.created_by_email;
  const createdByEmail =
    createdRaw != null && String(createdRaw).trim() !== ''
      ? String(createdRaw).trim().toLowerCase()
      : null;
  return {
    id,
    name,
    price,
    stockUnits,
    supplier: String(row.supplier ?? ''),
    lotId: String(row.lotId ?? ''),
    packedOn: String(row.packedOn ?? ''),
    createdByEmail,
  };
}

export async function fetchListingsFromServer(): Promise<ProduceListing[]> {
  const res = await fetch(`${API_BASE}/api/listings`);
  if (!res.ok) throw new Error('Failed to load listings');
  const data = (await res.json()) as { listings?: unknown[] };
  const rows = Array.isArray(data.listings) ? data.listings : [];
  return rows.map((r) => parseListingRow(r as Record<string, unknown>)).filter((x): x is ProduceListing => x !== null);
}

export async function postListingToServer(
  item: ProduceListing,
  createdByEmail: string | null,
): Promise<void> {
  const owner = (createdByEmail ?? item.createdByEmail ?? '').trim().toLowerCase() || null;
  const res = await fetch(`${API_BASE}/api/listings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: item.id,
      name: item.name,
      price: item.price,
      stockUnits: item.stockUnits,
      supplier: item.supplier,
      lotId: item.lotId,
      packedOn: item.packedOn,
      created_by_email: owner,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'Failed to save listing');
  }
}

export async function adjustListingStockOnServer(listingId: number, delta: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/listings/${listingId}/stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'Stock update failed');
  }
}

export async function deleteListingFromServer(listingId: number, email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/listings/${listingId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'Could not remove listing');
  }
}

export async function fetchCartFromServer(email: string): Promise<ShopCartLine[]> {
  const res = await fetch(`${API_BASE}/api/cart?email=${encodeURIComponent(email)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { cart?: unknown };
  const raw = data.cart;
  if (!Array.isArray(raw)) return [];
  return raw.filter((line): line is ShopCartLine => {
    if (!line || typeof line !== 'object') return false;
    const l = line as ShopCartLine;
    return Number.isFinite(l.id) && Number.isFinite(l.listingId) && typeof l.name === 'string';
  });
}

export async function saveCartToServer(email: string, cart: ShopCartLine[]): Promise<void> {
  await fetch(`${API_BASE}/api/cart`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), cart }),
  });
}
