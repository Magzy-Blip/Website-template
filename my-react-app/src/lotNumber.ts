
const LOT_SEQUENCE_STORAGE_KEY = 'produce_lot_global_seq_v1';

const PRODUCT_SEGMENT: Record<string, string> = {
  Carrot: 'CAR',
  Broccoli: 'BRO',
  Spinach: 'SPI',
  Cucumber: 'CUC',
  Tomato: 'TOM',
  Lettuce: 'LET',
  'Bell pepper': 'BELPEP',
  Onion: 'ONI',
  Potato: 'POT',
  Kale: 'KAL',
  Apple: 'APL',
  Banana: 'BAN',
  Orange: 'ORG',
  Strawberry: 'STR',
  Grape: 'GRP',
  Blueberry: 'BLU',
  Mango: 'MAN',
  Pear: 'PEA',
  Watermelon: 'WMN',
  Avocado: 'AVO',
};

function localYyyymmdd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function packDateYmdLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function padSeq(n: number, width: number): string {
  const s = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(n))).toString();
  return s.length >= width ? s.slice(-width) : s.padStart(width, '0');
}

export function productSegmentForName(displayName: string): string {
  const mapped = PRODUCT_SEGMENT[displayName];
  if (mapped) return mapped.slice(0, 8);
  const slug = displayName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (slug.length >= 3) return slug.slice(0, 8);
  let h = 2166136261;
  for (let i = 0; i < displayName.length; i++) {
    h ^= displayName.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const tail = (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6);
  return `X${tail}`.slice(0, 8);
}

export function getNextLotId(productDisplayName: string): string {
  const product = productSegmentForName(productDisplayName);
  const date = localYyyymmdd();

  if (typeof window === 'undefined') {
    return `LT-${date}-000000000001-${product}`;
  }

  const raw = localStorage.getItem(LOT_SEQUENCE_STORAGE_KEY);
  const prev = Number.parseInt(raw ?? '0', 10);
  const next = Number.isFinite(prev) && prev >= 0 ? prev + 1 : 1;
  localStorage.setItem(LOT_SEQUENCE_STORAGE_KEY, String(next));

  return `LT-${date}-${padSeq(next, 12)}-${product}`;
}

export function describeLotIdFormat(productDisplayName: string): string {
  if (!productDisplayName.trim()) return 'Choose produce — a unique lot ID is assigned when you add to the gallery.';
  const seg = productSegmentForName(productDisplayName);
  return `Format: LT-YYYYMMDD-12-digit global #-${seg} (assigned on save).`;
}
