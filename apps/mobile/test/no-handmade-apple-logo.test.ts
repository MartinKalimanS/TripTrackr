/**
 * F12 (owner decision 2026-10-22, `docs/roadmap/DECISIONS.md`): wherever the Apple logo is
 * drawn the app uses Apple's OFFICIAL artwork, never a hand-made or icon-font glyph. The only
 * compliant way in Expo is the native `AppleAuthenticationButton` of `expo-apple-authentication`
 * (it draws Apple's own logo and localised title), so:
 *
 * - no source names the Ionicons stand-in (`logo-apple`, `Ionicons`) or the colours the drawn
 *   button used (`AppleButton`);
 * - the native button is drawn in ONE place (`components/auth/apple-official-button.tsx`), so a
 *   second, differently styled Apple button cannot arrive unnoticed;
 * - no image or vector asset with "apple" in its name ships in `assets/`.
 *
 * Like `no-neumorphism.test.ts`, this is a source scan: a guard, not a behaviour.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APP = path.resolve(__dirname, '..');
const SRC = path.join(APP, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
  );
}

const sources = walk(SRC).filter(
  (file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file),
);
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

describe('no hand-made Apple logo', () => {
  test('finds the sources it scans', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  test('no source names the stand-in glyph, the icon font or the retired Apple colours', () => {
    const offenders = sources
      .filter((file) =>
        /logo-apple|Ionicons|\bAppleButton\b/.test(readFileSync(file, 'utf8')),
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test("Apple's own button is drawn in one place only", () => {
    const drawing = sources
      .filter((file) =>
        /<AppleAuthentication\.AppleAuthenticationButton\b/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map(rel);
    expect(drawing).toEqual(['components/auth/apple-official-button.tsx']);
  });

  test('no image or vector asset of an Apple logo ships with the app', () => {
    const assets = walk(path.join(APP, 'assets')).map((file) => path.basename(file));
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.filter((name) => /apple/i.test(name))).toEqual([]);
  });
});
