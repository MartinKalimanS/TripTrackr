/**
 * T524 - the `assertScreenshot` harness of research D5-18, as files: a Maestro flow that takes or
 * compares one screenshot per theme and text scale of the dev gallery, a helper that records or
 * asserts, and a baseline directory whose README says how a baseline is recorded (on a device, then
 * committed; the harness records none and invents none).
 *
 * Maestro cannot run under Jest, so what is held is the shape: the flow covers all eight
 * combinations, is `manual` (so `config.yaml` never runs it unattended: the gallery exists only
 * in a development build), selects what the gallery really exposes, and the README names every
 * baseline the flow will look for. `scripts/testid-baseline.mjs --check` separately proves each
 * `id:` selector is served by a testID in the sources.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PaletteNames } from '@/theme';

const E2E = path.resolve(__dirname, '../../e2e');
const read = (relative: string) => fs.readFileSync(path.join(E2E, relative), 'utf8');

const SCALES = ['1', '2'];
const COMBINATIONS = PaletteNames.flatMap((theme) =>
  SCALES.map((scale) => ({ theme, scale })),
);

describe('e2e/gallery.yaml', () => {
  const flow = read('gallery.yaml');

  test('runs one pass for each of the four themes at both scales', () => {
    const passes = [...flow.matchAll(/THEME: '([a-z-]+)'\s+SCALE: '(\d)'/g)].map(
      (match) => ({ theme: match[1], scale: match[2] }),
    );
    expect(passes).toHaveLength(8);
    for (const combination of COMBINATIONS) expect(passes).toContainEqual(combination);
  });

  test('is manual: the standing suite never runs it, and it needs a development build', () => {
    expect(flow).toMatch(/tags:\s*\n\s*- gallery\s*\n\s*- manual/);
    expect(read('config.yaml')).toMatch(/excludeTags:\s*\n\s*- manual/);
    expect(flow).toContain('appId: com.triptrackr.app.dev');
    expect(flow).toContain("openLink: 'com.triptrackr.app.dev:///gallery'");
  });

  test('is ASCII, like the other flows', () => {
    for (const file of [
      'gallery.yaml',
      'gallery/pass.yaml',
      'gallery/assert-screenshot.yaml',
    ]) {
      expect(read(file)).toMatch(/^[\x00-\x7F]*$/);
    }
  });
});

describe('the pass and the helper', () => {
  test('a pass chooses the theme and the scale with the gallery switches and checks the readout', () => {
    const pass = read('gallery/pass.yaml');
    expect(pass).toContain("id: 'gallery-theme-${THEME}'");
    expect(pass).toContain("id: 'gallery-scale-${SCALE}'");
    expect(pass).toContain("id: 'gallery-readout'");
    expect(pass).toContain("SHOT: 'gallery-${THEME}-x${SCALE}'");
  });

  test('the helper records with takeScreenshot or asserts with assertScreenshot, cropped', () => {
    const helper = read('gallery/assert-screenshot.yaml');
    expect(helper).toMatch(/true: \$\{MODE == 'record'\}/);
    expect(helper).toMatch(/takeScreenshot:[\s\S]*cropOn:[\s\S]*id: '\$\{CROP\}'/);
    expect(helper).toMatch(/assertScreenshot:[\s\S]*cropOn:[\s\S]*thresholdPercentage:/);
    expect(helper).toContain("path: '${BASELINES}/${SHOT}.png'");
  });

  test('the helper sits under e2e/gallery/, where config.yaml (e2e/*.yaml) does not run it', () => {
    expect(read('config.yaml')).toMatch(/- '\*\.yaml'/);
    expect(fs.existsSync(path.join(E2E, 'assert-screenshot.yaml'))).toBe(false);
  });
});

describe('e2e/__baselines__', () => {
  const folder = path.join(E2E, '__baselines__');

  test('holds a README that says baselines are recorded on a device and committed', () => {
    const readme = fs.readFileSync(path.join(folder, 'README.md'), 'utf8');
    expect(readme).toMatch(/recorded on a device/);
    expect(readme).toMatch(/never generated/);
  });

  test('names every baseline the flow looks for', () => {
    const readme = fs.readFileSync(path.join(folder, 'README.md'), 'utf8');
    for (const { theme, scale } of COMBINATIONS) {
      expect(readme).toContain(`gallery-${theme}-x${scale}.png`);
    }
  });
});
