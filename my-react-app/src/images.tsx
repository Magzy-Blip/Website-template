/**
 * Paste an image URL for each produce name below. Empty string hides the image until you add a link.
 */
export const vegetable_names = [
  'Carrot',
  'Broccoli',
  'Spinach',
  'Cucumber',
  'Tomato',
  'Lettuce',
  'Bell pepper',
  'Onion',
  'Potato',
  'Kale',
] as const;

export const fruit_names = [
  'Apple',
  'Banana',
  'Orange',
  'Strawberry',
  'Grape',
  'Blueberry',
  'Mango',
  'Pear',
  'Watermelon',
  'Avocado',
] as const;

export const all_preset_names = [...vegetable_names, ...fruit_names] as readonly string[];

export const produce_image_links: Record<string, string> = {
  Carrot: '',
  Broccoli: '',
  Spinach: '',
  Cucumber: '',
  Tomato: '',
  Lettuce: '',
  'Bell pepper': '',
  Onion: '',
  Potato: '',
  Kale: '',
  Apple: '',
  Banana: '',
  Orange: '',
  Strawberry: '',
  Grape: '',
  Blueberry: '',
  Mango: '',
  Pear: '',
  Watermelon: '',
  Avocado: '',
};

export function produce_image_url(display_name: string): string {
  const trimmed = produce_image_links[display_name]?.trim();
  return trimmed ?? '';
}
