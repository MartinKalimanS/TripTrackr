/**
 * T540 - the sources of the trip list components (FR-009, FR-036; contract C5-13; the id parity
 * guard of feature 004). They take every visual value from the token layer and the adapters,
 * import no kit and no retired primitive, and write every id they build out in full, so the id
 * extractor reads each one with its literal head (`trip-card-`) and the unresolved-id ratchet
 * does not grow.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { analyseSources } from '../../../scripts/lib/extract-ids';

const FILES = [
  'components/trip/stop-strip.tsx',
  'components/trip/ticket-card.tsx',
  'components/trip/trip-cover-art.tsx',
  'components/trip/trip-hero-card.tsx',
  'components/trip/trip-row.tsx',
  'components/trip/year-header.tsx',
  'components/trip/year-scrubber.tsx',
  'features/trips/trip-card-copy.ts',
  'features/trips/trip-card-model.ts',
  'features/trips/trip-sections.ts',
];

const source = (file: string) =>
  readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
const importsOf = (text: string) =>
  [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

describe('the trip list sources', () => {
  test.each(FILES)('%s imports none of the retired primitives', (file) => {
    const specifiers = importsOf(source(file));
    expect(specifiers).not.toContain('@/components/ui/surface');
    expect(specifiers).not.toContain('@/components/ui/pressable-surface');
    expect(specifiers).not.toContain('@/components/themed-text');
    expect(specifiers).not.toContain('@/components/themed-view');
    expect(specifiers).not.toContain('@/components/trip/trip-card');
    expect(specifiers).not.toContain('@/components/trip/trip-cover-band');
  });

  test.each(FILES)(
    '%s has no colour literal, no gradient string and imports no kit',
    (file) => {
      const text = source(file);
      expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|\[#/);
      expect(text).not.toMatch(/(?:linear|radial|conic)-gradient\(/);
      expect(
        importsOf(text).some((from) =>
          /^(heroui-native|uniwind|phosphor-react-native|expo-glass-effect)/.test(from),
        ),
      ).toBe(false);
    },
  );

  test('every id the cards build is readable by the id extractor', () => {
    const { ids, unresolved } = analyseSources(
      FILES.map((file) => ({ path: `src/${file}`, text: source(file) })),
    );

    expect(unresolved.testIDs).toEqual([]);
    expect(ids.testIDs).toEqual(
      expect.arrayContaining([
        'trip-card-<param>',
        'trip-card-<param>-cover',
        'trip-card-<param>-photo',
        'trip-card-<param>-cue',
        'trip-card-<param>-status-row',
        'trip-card-<param>-meta-row',
        'trip-card-<param>-stub',
        'year-header-<param>',
        'trips-year-scrubber',
        'stop-strip',
      ]),
    );
  });
});
