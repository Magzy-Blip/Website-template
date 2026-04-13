/**
 * Central lot / batch ID generation for **large-scale product traceability**.
 *
 * **Format:** `LT-{YYYYMMDD}-{SEQ12}-{PRODUCT}`
 * - **LT** — fixed prefix (“lot trace”) for quick scanning in logs and labels.
 * - **YYYYMMDD** — local calendar **pack day** for time-bucketed reports and expiry workflows.
 * - **SEQ12** — **global** 12-digit zero-padded counter in `localStorage` (unique across **every**
 *   product on the site, monotonic per browser; swap for a DB/Redis atomic sequence in production).
 * - **PRODUCT** — stable short **segment per catalog name** so lots group by SKU line in WMS-style filters;
 *   unknown names fall back to a deterministic alphanumeric segment.
 *
 * IDs sort lexicographically by date, then global intake order, then product family — suitable for
 * high-volume receiving and audit trails. Call **`getNextLotId` only when committing a new listing**
 * so previewing the form does not consume sequence numbers.
 */

/** Monotonic counter — one increment per new lot issued (all products share this stream). */
const LOT_SEQUENCE_STORAGE_KEY = 'produce_lot_global_seq_v1';

/**
 * Stable 3–8 character segment per preset produce name (SKU-line grouping at scale).
 * Keep in sync with create-item `<select>` options in `Landing.tsx`.
 */
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

/**
 * Local calendar **pack date** as `YYYY-MM-DD` — same calendar day as the lot id’s `YYYYMMDD` segment.
 * Use when saving a listing so pack date is never hand-edited and stays aligned with traceability.
 */
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

/**
 * Resolves the product segment for the lot string (known preset → map; else compact deterministic code).
 */
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

/**
 * Issues the next globally unique lot id for this product name and **increments** the stored sequence.
 * Safe for high volume: 12-digit counter supports billions of lots per device before rollover planning.
 */
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

/** UI hint: shows the pattern and product segment without consuming a sequence number. */
export function describeLotIdFormat(productDisplayName: string): string {
  if (!productDisplayName.trim()) return 'Choose produce — a unique lot ID is assigned when you add to the gallery.';
  const seg = productSegmentForName(productDisplayName);
  return `Format: LT-YYYYMMDD-12-digit global #-${seg} (assigned on save).`;
}
