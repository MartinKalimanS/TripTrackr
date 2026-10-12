/**
 * `fnv1a32` - the 32-bit FNV-1a hash of a string (feature 005, research D5-08, data-model
 * sections 4 and 10).
 *
 * It is the one source of "random" for things that must look the same on every launch and
 * every device: a passport stamp's shape, ink and tilt (`fnv1a32(country + '|' + day)`), a
 * generated cover's palette (`fnv1a32(tripId) % 3`). Integer arithmetic only: no locale, no
 * `Math.random`, no engine-dependent string encoding. The text is hashed as UTF-8 bytes, as
 * the published algorithm is (http://www.isthe.com/chongo/tech/comp/fnv/), so a name with an
 * accent or an emoji hashes the same wherever it was typed; a lone surrogate counts as
 * U+FFFD instead of throwing, because a hash must not be the reason a list does not render.
 *
 * Pure.
 */

const OFFSET_BASIS = 0x811c9dc5;
const PRIME = 0x01000193;
const REPLACEMENT = 0xfffd;

/** The UTF-8 bytes of one code point (up to U+10FFFF). */
function utf8Bytes(codePoint: number): number[] {
  if (codePoint < 0x80) return [codePoint];
  if (codePoint < 0x800) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  }
  if (codePoint < 0x10000) {
    return [
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    ];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

/** The code point at `index` and how many UTF-16 units it takes; a lone surrogate is U+FFFD. */
function codePointAt(text: string, index: number): [number, number] {
  const unit = text.charCodeAt(index);
  const isHigh = unit >= 0xd800 && unit <= 0xdbff;
  const isLow = unit >= 0xdc00 && unit <= 0xdfff;
  if (isLow) return [REPLACEMENT, 1];
  if (!isHigh) return [unit, 1];
  const next = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;
  if (next < 0xdc00 || next > 0xdfff) return [REPLACEMENT, 1];
  return [0x10000 + ((unit - 0xd800) << 10) + (next - 0xdc00), 2];
}

/** The unsigned 32-bit FNV-1a hash of `text`, hashed as UTF-8. */
export function fnv1a32(text: string): number {
  let hash = OFFSET_BASIS;
  let index = 0;
  while (index < text.length) {
    const [codePoint, width] = codePointAt(text, index);
    for (const byte of utf8Bytes(codePoint)) {
      hash = Math.imul(hash ^ byte, PRIME);
    }
    index += width;
  }
  return hash >>> 0;
}
