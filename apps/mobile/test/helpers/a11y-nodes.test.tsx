/**
 * The reading-order helper itself (feature 005, T560): what it counts as a stop, what it hides,
 * how it names a stop and what its order assertion reports. The suites that use it
 * (`test/a11y/*`) rely on exactly these rules.
 */
import { render } from '@testing-library/react-native';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import {
  accessibleNodes,
  describeNodes,
  exposedArt,
  expectReadingOrder,
  firstOutOfOrder,
  hostById,
  unnamed,
} from './a11y-nodes';

async function show() {
  await render(
    <View testID="root">
      <Text>Heading</Text>
      <Text accessible={false}>Not a stop</Text>
      <Pressable
        testID="go"
        accessibilityRole="button"
        accessibilityLabel="Go"
        accessibilityHint="Goes"
        accessibilityValue={{ text: 'Ready' }}
        accessibilityState={{ selected: true, disabled: false }}>
        <Text>Inner words</Text>
      </Pressable>
      <Pressable testID="group" accessibilityRole="button">
        <Text>Two</Text>
        <Text>parts</Text>
      </Pressable>
      <TextInput testID="field" accessibilityLabel="Name" />
      <Image testID="pic" source={{ uri: 'x' }} accessibilityLabel="A picture" />
      <Image testID="art" source={{ uri: 'y' }} />
      <View testID="hidden" accessibilityElementsHidden>
        <Text>Secret</Text>
      </View>
      <View importantForAccessibility="no-hide-descendants">
        <Text>Secret too</Text>
      </View>
      <View aria-hidden>
        <Text>Secret three</Text>
      </View>
      <View style={[{ opacity: 1 }, { display: 'none' }]}>
        <Text>Gone</Text>
      </View>
      <View importantForAccessibility="no">
        <Text>Still read</Text>
      </View>
      <Text testID="run">
        Hello, <Text>Ana</Text>
      </Text>
      <View
        testID="globe"
        accessible
        accessibilityLabel="Globe"
        accessibilityActions={[{ name: 'next', label: 'Next trip' }, { name: 'back' }]}
      />
      <Pressable testID="blank" accessibilityRole="button" />
    </View>,
  );
}

describe('accessibleNodes', () => {
  test('lists the stops in reading order, naming each one', async () => {
    await show();
    const nodes = accessibleNodes();
    expect(nodes.map((node) => node.name)).toEqual([
      'Heading',
      'Go',
      'Two parts',
      'Name',
      'A picture',
      'Still read',
      'Hello, Ana',
      'Globe',
      '',
    ]);
  });

  test('a label wins over the text inside, and the group is one stop', async () => {
    await show();
    const nodes = accessibleNodes();
    const go = nodes.find((node) => node.id === 'go')!;
    expect(go).toMatchObject({
      role: 'button',
      hint: 'Goes',
      value: 'Ready',
      state: ['selected'],
    });
    expect(nodes.some((node) => node.name === 'Inner words')).toBe(false);
  });

  test('skips what is hidden from assistive technology, and an accessible={false} text', async () => {
    await show();
    const names = accessibleNodes().map((node) => node.name);
    for (const gone of ['Secret', 'Secret too', 'Secret three', 'Gone', 'Not a stop']) {
      expect(names).not.toContain(gone);
    }
    expect(accessibleNodes().some((node) => node.id === 'art')).toBe(false);
  });

  test('says the pieces of one text run together, and offers the actions by label', async () => {
    await show();
    const nodes = accessibleNodes();
    expect(nodes.find((node) => node.id === 'run')?.name).toBe('Hello, Ana');
    expect(nodes.find((node) => node.id === 'globe')?.actions).toEqual([
      'Next trip',
      'back',
    ]);
  });

  test('names an unlabelled control with nothing in it as a finding', async () => {
    await show();
    expect(unnamed(accessibleNodes()).map((node) => node.id)).toEqual(['blank']);
  });

  test('can start from one node of the screen', async () => {
    await show();
    expect(accessibleNodes(hostById('group')).map((node) => node.name)).toEqual([
      'Two parts',
    ]);
    expect(() => hostById('missing')).toThrow(/No node with testID "missing"/);
  });
});

describe('the order assertions', () => {
  const nodes = [
    { name: 'Back', id: 'back', kind: 'View', role: 'button', state: [], actions: [] },
    { name: 'Title', kind: 'Text', role: 'header', state: [], actions: [] },
    {
      name: 'Save',
      id: 'save',
      kind: 'View',
      role: 'button',
      state: ['disabled'],
      actions: [],
    },
  ];

  test('accepts ids, names and patterns in order, with room between them', () => {
    expect(firstOutOfOrder(nodes, ['back', /^Tit/, 'Save'])).toBeNull();
    expect(firstOutOfOrder(nodes, ['back', 'save'])).toBeNull();
  });

  test('reports the first expectation that is early, late or missing', () => {
    expect(firstOutOfOrder(nodes, ['save', 'back'])).toEqual({
      wanted: 'back',
      after: 3,
    });
    expect(firstOutOfOrder(nodes, ['nothing'])?.wanted).toBe('nothing');
  });

  test('the failure shows the whole tree, with role and state', () => {
    expect(() => expectReadingOrder(nodes, ['save', 'back'])).toThrow(
      /3\. Save \[button, disabled\] #save/,
    );
    expect(describeNodes(nodes)).toContain('2. Title [header]');
    expect(describeNodes([{ name: '', kind: 'View', state: [], actions: [] }])).toBe(
      '1. (unnamed)',
    );
  });
});

describe('exposedArt', () => {
  test('finds a drawing that nothing hides and nothing speaks for', async () => {
    await render(
      <View>
        <View testID="scrim-top" accessibilityElementsHidden />
        <View
          testID="card"
          accessible
          accessibilityLabel="Trip"
          accessibilityRole="button">
          <View testID="phosphor-react-native-caret-right-regular" />
        </View>
        <View accessibilityElementsHidden>
          <View testID="svg-Path" />
        </View>
        <View testID="stamp-art-PT" />
        <Text>Words</Text>
      </View>,
    );
    expect(exposedArt()).toEqual(['stamp-art-PT']);
  });
});
