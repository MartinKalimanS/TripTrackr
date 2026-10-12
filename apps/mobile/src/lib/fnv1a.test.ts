/**
 * T523 - research D5-08 (stamps) and data-model sections 4 and 10: `fnv1a32` is the one hash
 * behind a stamp's shape, ink and tilt and behind a generated cover's palette. Its answer
 * must be the same on every launch and every device (SC-016), so it is pinned to the
 * published FNV-1a test vectors, and a non-ASCII string is hashed as UTF-8 bytes, not as the
 * UTF-16 units the engine happens to hold.
 */
import { fnv1a32 } from './fnv1a';

describe('fnv1a32 - the published 32-bit FNV-1a vectors', () => {
  test.each([
    ['', 0x811c9dc5],
    ['a', 0xe40c292c],
    ['foo', 0xa9f37ed7],
    ['foobar', 0xbf9cf968],
    ['hello', 0x4f9f2cab],
  ])('%j hashes to %i', (text, expected) => {
    expect(fnv1a32(text)).toBe(expected);
  });

  test('hashes the UTF-8 bytes of a non-ASCII string', () => {
    // 'é' is the two bytes C3 A9, a pictograph four bytes: a surrogate pair is ONE code point.
    expect(fnv1a32('\u00e9')).toBe(0x1e9de8c1);
    expect(fnv1a32('\u{1F600}')).toBe(0x33a29608);
  });

  test('pins the stamp key of a country and a day', () => {
    expect(fnv1a32('PT|2026-10-12')).toBe(0xa0a78963);
  });

  test('a lone surrogate is hashed as the replacement character, never thrown on', () => {
    expect(fnv1a32('\ud83d')).toBe(fnv1a32('\ufffd'));
    expect(fnv1a32('a\ude00b')).toBe(fnv1a32('a\ufffdb'));
  });
});

describe('fnv1a32 - shape of the answer', () => {
  test('is an unsigned 32-bit integer for every input', () => {
    for (const text of ['', 'x', 'Lisbon', 'trip-0001', '\u{1F30D}'.repeat(40)]) {
      const hash = fnv1a32(text);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });

  test('is deterministic and order sensitive', () => {
    expect(fnv1a32('ab')).toBe(fnv1a32('ab'));
    expect(fnv1a32('ab')).not.toBe(fnv1a32('ba'));
  });

  test('spreads 3000 distinct keys over every residue mod 6 and mod 4', () => {
    const mod6 = new Set<number>();
    const mod4 = new Set<number>();
    for (let index = 0; index < 3000; index += 1) {
      const hash = fnv1a32(`trip-${index}`);
      mod6.add(hash % 6);
      mod4.add((hash >>> 3) % 4);
    }
    expect(mod6.size).toBe(6);
    expect(mod4.size).toBe(4);
  });
});
