//This file is just a preview of what the images may look like when the user adds them to the item listing.
export const vegetable_names = ['Carrot'] as const;

export const fruit_names = [] as const;

export const all_preset_names = [...vegetable_names, ...fruit_names] as readonly string[];

export const produce_image_links: Record<string, string> = {
  Carrot: '',
};

export function produce_image_url(display_name: string): string {
  const trimmed = produce_image_links[display_name]?.trim();
  return trimmed ?? '';
}
