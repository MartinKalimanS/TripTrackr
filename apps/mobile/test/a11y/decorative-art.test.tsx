/**
 * T560 - decorative art is hidden from assistive technology (feature 005; FR-076, SC-015). The
 * audit table is in `reference/as-built/f14-a11y.md`; this is what holds it:
 *
 * - every source file that draws with `react-native-svg` says, in the same file, that what it
 *   draws is hidden (`accessibilityElementsHidden` AND `importantForAccessibility=
 *   "no-hide-descendants"`, the pair both platforms need), so a new drawing cannot arrive bare;
 * - each kind of `Scrim` (the sky, the photograph bands, the fade, the cover glow, the passport
 *   and recap gradients), a `Stamp`, a `GhostStamp`, a `GeneratedCover`, a `ProgressRing`, a
 *   decorative `Icon` and a decorative `Avatar` are, rendered alone, no stop of the reading order
 *   and carry the pair; the captioned scrim hides its ramp and not its words; a labelled icon is
 *   ONE image. The native map's layers (atmosphere, graticule, gradient arcs, pins) draw inside
 *   the ONE map stop and have no node of their own (`order-home.test.tsx`).
 */
import { render } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { Text } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { GeneratedCover } from '@/components/ui/generated-cover';
import { Icon } from '@/components/ui/icon';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Scrim, type ScrimKind } from '@/components/ui/scrim';
import { GhostStamp, Stamp } from '@/components/ui/stamp';
import { stampSpec } from '@/components/ui/stamp-spec';
import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import {
  accessibleNodes,
  exposedArt,
  hidesDescendants,
  hostById,
} from '../helpers/a11y-nodes';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    themeName: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: true,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ready: true,
  });
});

const SRC = path.resolve(__dirname, '..', '..', 'src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('every drawing in the source says it is hidden', () => {
  const drawing = sourceFiles(SRC).filter((file) =>
    /from 'react-native-svg'/.test(fs.readFileSync(file, 'utf8')),
  );

  test('finds the eight files that draw with react-native-svg today', () => {
    expect(drawing.map((file) => path.basename(file)).sort()).toEqual([
      'brand-glyph.tsx',
      'generated-cover.tsx',
      'passport-card.tsx',
      'progress-ring.tsx',
      'spine.tsx',
      'stamp.tsx',
      'welcome-globe.tsx',
      'welcome-mark.tsx',
    ]);
  });

  test.each(drawing.map((file) => [path.basename(file), file]))(
    '%s carries accessibilityElementsHidden and no-hide-descendants',
    (_name, file) => {
      const text = fs.readFileSync(file, 'utf8');
      expect(text).toMatch(/accessibilityElementsHidden/);
      expect(text).toMatch(/no-hide-descendants/);
    },
  );
});

const PLAIN_KINDS: ScrimKind[] = [
  'top',
  'bottom',
  'sky',
  'cover',
  'fade',
  'passport',
  'recap',
];

describe('a drawing rendered alone is no stop, and wears the pair', () => {
  test.each(PLAIN_KINDS)('the %s scrim', async (kind) => {
    await render(<Scrim kind={kind} palette={0} />);
    const scrim = hostById(`scrim-${kind}`);
    expect(hidesDescendants(scrim)).toBe(true);
    expect(scrim.props.accessibilityElementsHidden).toBe(true);
    expect(scrim.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(scrim.props.pointerEvents).toBe('none');
    expect(accessibleNodes()).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('the captioned scrim hides its ramp and reads its words', async () => {
    await render(
      <Scrim kind="caption">
        <Text>Lisbon, in the rain</Text>
      </Scrim>,
    );
    expect(accessibleNodes().map((node) => node.name)).toEqual(['Lisbon, in the rain']);
    expect(exposedArt()).toEqual([]);
  });

  test('a stamp and a ghost stamp', async () => {
    await render(
      <>
        <Stamp spec={stampSpec('PT', '2026-10-12', 'Lisboa')} testID="a-stamp" />
        <GhostStamp testID="a-ghost" />
      </>,
    );
    for (const id of ['a-stamp', 'a-ghost']) {
      const host = hostById(id);
      expect(host.props.accessibilityElementsHidden).toBe(true);
      expect(host.props.importantForAccessibility).toBe('no-hide-descendants');
    }
    expect(accessibleNodes()).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('a generated cover, with its glyph, its flag and its stamp', async () => {
    await render(<GeneratedCover palette={1} iso2="PT" initial="Portugal" />);
    const cover = hostById('generated-cover');
    expect(cover.props.accessibilityElementsHidden).toBe(true);
    expect(cover.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(accessibleNodes()).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('a progress ring and the figure inside it', async () => {
    await render(
      <ProgressRing value={14} max={195} testID="ring">
        <Text>14</Text>
      </ProgressRing>,
    );
    expect(hostById('ring').props.accessibilityElementsHidden).toBe(true);
    expect(accessibleNodes()).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('an icon is decoration unless it is given a label, and then it is ONE image', async () => {
    await render(
      <>
        <Icon name="chevron-right" testID="plain-icon" />
        <Icon name="calendar" label="Planning" testID="named-icon" />
      </>,
    );
    expect(hidesDescendants(hostById('plain-icon'))).toBe(true);
    expect(accessibleNodes()).toEqual([
      expect.objectContaining({ id: 'named-icon', name: 'Planning', role: 'image' }),
    ]);
    expect(exposedArt()).toEqual([]);
  });

  test('an avatar beside the name is hidden; alone it names the person', async () => {
    await render(
      <>
        <Avatar name="Marta Ruiz" decorative testID="beside" />
        <Avatar name="Marta Ruiz" testID="alone" />
      </>,
    );
    const stops = accessibleNodes();
    expect(stops.some((node) => node.id === 'beside')).toBe(false);
    expect(stops.find((node) => node.id === 'alone')?.name).toMatch(/Marta Ruiz/);
  });
});
