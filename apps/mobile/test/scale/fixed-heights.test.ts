/**
 * T561 - the fixed-height ratchet (feature 005; FR-074: "Fixed heights MUST be minimums";
 * SC-007): the screens and components pin a size in a handful of places that hold no text
 * (an icon disc, a thumbnail, a dot, a hairline, a handle, a skeleton bone). Every one is
 * listed in `fixed-heights.allowlist.json` with the reason it cannot clip, and this suite fails when
 *
 * - a file under `src/components` or `src/app` gains a fixed size that is not listed (a
 *   `height:` style, an `h-<n>` or `size-<n>` class, `allowFontScaling={false}`), so a new fixed
 *   height on a text container cannot arrive unnoticed: use `minHeight`, or list it with a reason;
 * - a listed file has more or fewer sites than its entry says (an entry must not outlive
 *   its cause, so removing a fixed height means lowering the count);
 * - an entry has no reason, names a file that is gone, or is listed twice.
 *
 * Allow-list schema (`fixed-heights.allowlist.json`; JSON has no comments, so it is described
 * here):
 *
 *   { "entries": [ { "file": "src/components/ui/sheet.tsx", "count": 6, "reason": "..." } ] }
 *
 * `file` is repository-relative (forward slashes) to `apps/mobile`; `count` is the number of
 * sites the scan finds in it; `reason` says what is fixed and why it cannot clip text.
 *
 * What is NOT read: tests, the dev gallery, hooks, features and the theme files (they hold
 * arithmetic; the style that applies it is in a component this scan reads). The rendered side
 * of the rule (no node that holds text pins a `height` at a font scale of 1, 1.15, 1.5 and 2)
 * is in `reflow-components.test.tsx` and `reflow-screens.test.tsx`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { fixedSizesIn, fixedSizesInTree } from './fixed-sizes-scan';

interface Entry {
  file: string;
  count: number;
  reason: string;
}

const ROOT = path.resolve(__dirname, '../..');
const ALLOWLIST = JSON.parse(
  readFileSync(path.join(__dirname, 'fixed-heights.allowlist.json'), 'utf8'),
) as { entries: Entry[] };

describe('the scan (what counts as a fixed size)', () => {
  const kinds = (source: string) => fixedSizesIn(source).map((site) => site.kind);

  test('finds a height style, in an object, in a StyleSheet and inline', () => {
    expect(kinds('style={{ height: 40 }}')).toEqual(['height']);
    expect(
      kinds('const s = StyleSheet.create({ bar: { width: 4, height: 2 } });'),
    ).toEqual(['height']);
    expect(kinds('      height: DISC,')).toEqual(['height']);
  });

  test('does not count minHeight, maxHeight, lineHeight or a field named onHeight', () => {
    expect(kinds('style={{ minHeight: 72 }}')).toEqual([]);
    expect(kinds('style={{ maxHeight: 300 }}')).toEqual([]);
    expect(kinds('style={{ lineHeight: 20 }}')).toEqual([]);
    expect(kinds('onHeight: (height: number) => void;')).toEqual([]);
  });

  test('does not count a type member', () => {
    expect(kinds('  height: number;')).toEqual([]);
    expect(kinds('type Size = { width: number; height: number };')).toEqual([]);
  });

  test('finds a fixed height or size class, not a min or max one', () => {
    expect(kinds('<Bone className="h-[268px] w-full" />')).toEqual(['class']);
    expect(kinds('<View className="size-5 rounded-full" />')).toEqual(['class']);
    expect(kinds('<View className="h-px bg-separator" />')).toEqual(['class']);
    expect(kinds('<View className="min-h-[72px] max-h-40" />')).toEqual([]);
    expect(kinds('<View className="w-24 h-full" />')).toEqual([]);
  });

  test('finds text that ignores the system size', () => {
    expect(kinds('<Text allowFontScaling={false}>PT</Text>')).toEqual(['noScaling']);
  });

  test('skips comments, so prose about a height never counts', () => {
    expect(kinds('// height: 40 on the old card')).toEqual([]);
    expect(kinds(' * the picture draws height: 219')).toEqual([]);
    expect(kinds('/** A 64 dp tall bar: height: 64 */')).toEqual([]);
    expect(kinds('const a = 1; // height: 40')).toEqual([]);
  });

  test('reports the line and counts a line with two kinds twice', () => {
    const sites = fixedSizesIn(
      'const a = 1;\n<View className="h-5" style={{ height: 4 }} />',
    );
    expect(sites.map((site) => [site.line, site.kind])).toEqual([
      [2, 'height'],
      [2, 'class'],
    ]);
  });
});

describe('the allow-list', () => {
  test('has one entry per file, each with a reason and a count', () => {
    const files = ALLOWLIST.entries.map((entry) => entry.file);
    expect(new Set(files).size).toBe(files.length);
    for (const entry of ALLOWLIST.entries) {
      expect(entry.reason.trim().length).toBeGreaterThanOrEqual(20);
      expect(Number.isInteger(entry.count) && entry.count > 0).toBe(true);
      expect(existsSync(path.join(ROOT, entry.file))).toBe(true);
    }
  });
});

describe('the tree', () => {
  const found = fixedSizesInTree();
  const listed = new Map(ALLOWLIST.entries.map((entry) => [entry.file, entry.count]));

  const where = (file: string) =>
    (found.get(file) ?? []).map((site) => `${file}:${site.line}  ${site.text}`);

  test('every fixed size is in a listed file (a new fixed height is a minHeight, or listed with a reason)', () => {
    const unlisted = [...found.keys()].filter((file) => !listed.has(file));
    expect(unlisted.flatMap(where)).toEqual([]);
  });

  test('every listed file has exactly the listed number of sites (no new one, none left over)', () => {
    const drift = ALLOWLIST.entries
      .filter((entry) => (found.get(entry.file)?.length ?? 0) !== entry.count)
      .flatMap((entry) => [
        `${entry.file}: listed ${entry.count}, found ${found.get(entry.file)?.length ?? 0}`,
        ...where(entry.file),
      ]);
    expect(drift).toEqual([]);
  });
});
