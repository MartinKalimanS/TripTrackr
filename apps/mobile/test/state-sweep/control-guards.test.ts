/**
 * T559 - the two guards of the state sweep (FR-064, FR-066, FR-080 as amended by Q-11):
 *
 * (a) no control of any screen state is a dead end: every pressable has a handler or is
 *     explicitly disabled;
 * (b) no control that is pictured without a capability (Tier 3) is a quiet no-op: it is a
 *     coming-soon control (`ComingSoonButton` or `useComingSoon`), whose press is the one toast.
 *
 * The rules are pinned on small inputs first (so a guard that can no longer fail is itself a
 * failing test), then run over every screen and component of the app. The runtime half, which
 * renders each route's states, is in `route-states.test.tsx`.
 */
import fs from 'node:fs';
import path from 'node:path';

import { CONTROL_TAGS, findControlProblems, sweptSourceFiles } from './control-source';

const appRoot = path.resolve(__dirname, '../..');

const kinds = (text: string, file?: string) =>
  findControlProblems(text, file).map((problem) => problem.kind);

describe('guard (a): a control with no handler', () => {
  it.each(['Pressable', 'Tappable', 'Button', 'IconButton', 'AreaFab', 'PlanTripFab'])(
    'fails on a %s with no onPress',
    (tag) => {
      expect(kinds(`const a = <${tag} accessibilityLabel="Go" />;`)).toEqual([
        'no-handler',
      ]);
    },
  );

  it('fails on a handler that is the literal undefined or null', () => {
    expect(kinds('const a = <Button onPress={undefined} />;')).toEqual(['no-handler']);
    expect(kinds('const a = <Button onPress={null} />;')).toEqual(['no-handler']);
  });

  it('accepts onPress, onLongPress and onPressIn', () => {
    expect(kinds('const a = <Button onPress={go} />;')).toEqual([]);
    expect(kinds('const a = <Pressable onLongPress={go} />;')).toEqual([]);
    expect(kinds('const a = <Pressable onPressIn={go} />;')).toEqual([]);
  });

  it('accepts a control that is explicitly disabled', () => {
    expect(kinds('const a = <Button disabled />;')).toEqual([]);
    expect(kinds('const a = <Button disabled={locked} />;')).toEqual([]);
    expect(kinds('const a = <Button disabled={false} />;')).toEqual(['no-handler']);
  });

  it('accepts spread props and a child of Link asChild, which the router gives onPress', () => {
    expect(kinds('const a = <Tappable {...rest} />;')).toEqual([]);
    expect(
      kinds(
        'const a = <Link href="/" asChild><Button accessibilityLabel="Home" /></Link>;',
      ),
    ).toEqual([]);
    expect(
      kinds('const a = <Link href="/"><Button accessibilityLabel="Home" /></Link>;'),
    ).toEqual(['no-handler']);
  });

  it('reads the line of the control', () => {
    const [problem] = findControlProblems('const x = 1;\nconst a = <Button />;');
    expect(problem).toMatchObject({ kind: 'no-handler', tag: 'Button', line: 2 });
  });

  it('does not look at tags that are not controls', () => {
    expect(kinds('const a = <View><Text>hi</Text></View>;')).toEqual([]);
    expect(CONTROL_TAGS.has('Button')).toBe(true);
  });
});

describe('guard (b): a Tier 3 control that is not a coming-soon control', () => {
  it.each([
    'const a = <Button onPress={() => {}} />;',
    'const a = <Button onPress={() => undefined} />;',
    'const a = <Button onPress={() => void 0} />;',
    'const a = <IconButton onPress={function () {}} />;',
    'const a = <Button onPress={noop} />;',
    'const quiet = () => {};\nconst a = <Button onPress={quiet} />;',
    'function quiet() {}\nconst a = <Button onPress={quiet} />;',
  ])('fails on a quiet handler: %s', (text) => {
    expect(kinds(text)).toEqual(['no-op-handler']);
  });

  it('lets a disabled control keep an inert handler', () => {
    expect(kinds('const a = <Button disabled onPress={() => undefined} />;')).toEqual([]);
  });

  it('does not mistake a handler that does something for a no-op', () => {
    expect(kinds('const a = <Button onPress={() => router.back()} />;')).toEqual([]);
    expect(kinds('const a = <Button onPress={() => { save(); }} />;')).toEqual([]);
  });

  it('fails on a control that says coming soon without the one toast', () => {
    expect(
      kinds('const a = <Button testID="coming-soon-share" onPress={go} />;'),
    ).toEqual(['coming-soon-not-routed']);
    expect(
      kinds('const a = <Button accessibilityHint="Not available yet" onPress={go} />;'),
    ).toEqual(['coming-soon-not-routed']);
  });

  it('accepts the same control once it is routed through the adapter', () => {
    expect(
      kinds(
        "const soon = useComingSoon('Share');\n" +
          'const a = <Button testID="coming-soon-share" onPress={soon} />;',
      ),
    ).toEqual([]);
    expect(
      kinds('const a = <ComingSoonButton name="share" label="Share" icon="share" />;'),
    ).toEqual([]);
  });
});

describe('over the app', () => {
  const files = sweptSourceFiles(appRoot);

  it('reads the screens and the components', () => {
    const relative = files.map((file) =>
      path.relative(appRoot, file).replace(/\\/g, '/'),
    );
    expect(relative).toContain('src/app/(tabs)/index.tsx');
    expect(relative).toContain('src/components/ui/button.tsx');
    expect(relative.some((file) => file.startsWith('src/components/dev/'))).toBe(false);
    expect(relative.some((file) => file.endsWith('.test.tsx'))).toBe(false);
  });

  it('(a) finds no control without a handler', () => {
    const found = files.flatMap((file) =>
      findControlProblems(fs.readFileSync(file, 'utf8'), file)
        .filter((problem) => problem.kind === 'no-handler')
        .map(
          (problem) => `${path.relative(appRoot, file)}:${problem.line} <${problem.tag}>`,
        ),
    );
    expect(found).toEqual([]);
  });

  it('(b) finds no pictured control that is a quiet no-op or a coming-soon claim off the adapter', () => {
    const found = files.flatMap((file) =>
      findControlProblems(fs.readFileSync(file, 'utf8'), file)
        .filter((problem) => problem.kind !== 'no-handler')
        .map(
          (problem) =>
            `${path.relative(appRoot, file)}:${problem.line} <${problem.tag}> ${problem.kind}`,
        ),
    );
    expect(found).toEqual([]);
  });
});
