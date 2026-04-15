const lot_sequence_storage_key = 'produce_lot_global_seq_v1';

//This file generates lotnumbers for the produce items so they can be traced.
// the produce is assinged a 3 letter code word that that is used to make the process of producing a lotnumber faster.

const product_segment: Record<string, string> = {
  Carrot: 'CAR',
  Broccoli: 'BRO',
  Spinach: 'SPI',
  Cucumber: 'CUC',
  Tomato: 'TOM',
  Lettuce: 'LET',
  'Bell pepper': 'BEL',
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

//This function is used to make the lotnumber a fixed length (10char) so it can be stored easily and make tracking more accurate.
function pad_seq(n: number, width: number): string {
  const s = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(n))).toString();
  return s.length >= width ? s.slice(-width) : s.padStart(width, '0');
}

export function product_segment_for_name(display_name: string): string {
  const mapped = product_segment[display_name];
  if (mapped) return mapped.slice(0, 3);
  const slug = display_name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (slug.length >= 3) return slug.slice(0, 3);
  let h = 2166136261;
  for (let i = 0; i < display_name.length; i++) {
    h ^= display_name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const tail = (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-3);
  return tail.slice(0, 3);
}

export function pack_date_ymd_local(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Exactly 10 characters: 3-letter product code + 7-digit sequence. */
export function get_next_lot_id(product_display_name: string): string {
  if (typeof window === 'undefined') {
    return `${product_segment_for_name(product_display_name)}${pad_seq(1, 7)}`.slice(0, 10);
  }


  const raw = localStorage.getItem(lot_sequence_storage_key);
  const prev = Number.parseInt(raw ?? '0', 10);
  const next = Number.isFinite(prev) && prev >= 0 ? prev + 1 : 1;
  localStorage.setItem(lot_sequence_storage_key, String(next));

  const seg = product_segment_for_name(product_display_name).replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
  const seq_part = pad_seq(next, 7);
  return `${seg}${seq_part}`.slice(0, 10);
}

export function describe_lot_id_format(product_display_name: string): string {
  if (!product_display_name.trim()) return 'Choose produce — a unique 10-character lot ID is assigned when you add to the gallery.';
  const seg = product_segment_for_name(product_display_name);
  return `Format: 10 characters (${seg} + 7-digit sequence). Assigned when you save.`;
}
