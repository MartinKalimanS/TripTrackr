/**
 * What the dev gallery is made of (feature 005, T524; research D5-18): the two text scales and
 * the sections, as data, so the screen and the tests read one list. (The four themes are
 * `PaletteNames`.)
 *
 * Nothing here is imported outside `app/(dev)` and `components/dev` (a source test asserts it).
 */
/** The text scales the gallery lays out at: the default size and the largest (FR-029). */
export const GALLERY_SCALES = [1, 2] as const;

export type GalleryScale = (typeof GALLERY_SCALES)[number];

/** Every section, in reading order. Its container is `gallery-<id>`. */
export const SECTION_IDS = [
  'type',
  'buttons',
  'icon-buttons',
  'chips',
  'cards',
  'trips',
  'fields',
  'skeletons',
  'empty-states',
  'banners',
  'scrims',
  'stamps',
  'covers',
  'sheet',
  'navigation',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];
