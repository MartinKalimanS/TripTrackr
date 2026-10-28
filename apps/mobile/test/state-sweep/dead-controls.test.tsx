/**
 * T559 - the runtime half of guard (a), pinned on the app's own adapters: a pressable a
 * traveller could tap with no handler is found, and one with a handler, one that is disabled and
 * one that is busy are not. A sweep that cannot fail proves nothing, so this comes first.
 */
import { render } from '@testing-library/react-native';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Tappable } from '@/components/ui/tappable';
import { useAppearance } from '@/hooks/use-appearance';

import { appearance } from '../helpers/appearance';
import { deadControls, pressableCount } from '../helpers/dead-controls';

jest.mock('@/hooks/use-appearance');

beforeEach(() => {
  (useAppearance as jest.Mock).mockReturnValue(appearance());
});

describe('deadControls', () => {
  it('finds a Pressable, a Tappable, a Button and an IconButton with no handler', async () => {
    await render(
      <View>
        <Pressable accessibilityLabel="Raw" accessibilityRole="button" />
        <Tappable accessibilityLabel="Bare" />
        <Button accessibilityLabel="Labelled">Labelled</Button>
        <IconButton icon="search" accessibilityLabel="Icon" />
      </View>,
    );
    expect(deadControls().sort()).toEqual(
      ['"Bare"', '"Icon"', '"Labelled"', '"Raw"'].sort(),
    );
  });

  it('names a control by its testID when it has no label', async () => {
    await render(<Pressable testID="orphan" accessibilityRole="button" />);
    expect(deadControls()).toEqual(['#orphan']);
  });

  it('accepts a handler of any press kind', async () => {
    await render(
      <View>
        <Button accessibilityLabel="Go" onPress={jest.fn()}>
          Go
        </Button>
        <Pressable accessibilityLabel="Hold" onLongPress={jest.fn()} />
        <Pressable accessibilityLabel="Down" onPressIn={jest.fn()} />
      </View>,
    );
    expect(deadControls()).toEqual([]);
    expect(pressableCount()).toBe(3);
  });

  it('accepts a control that is explicitly disabled, and one that is busy', async () => {
    await render(
      <View>
        <Button accessibilityLabel="Off" disabled>
          Off
        </Button>
        <Tappable accessibilityLabel="Working" busy onPress={jest.fn()} />
        <Pressable accessibilityLabel="Raw off" disabled />
      </View>,
    );
    expect(deadControls()).toEqual([]);
  });

  it('does not hold a static row to a handler: a pressable with no role is not a control', async () => {
    await render(<Pressable testID="static-row" />);
    expect(pressableCount()).toBe(1);
    expect(deadControls()).toEqual([]);
  });

  it('counts nothing on a screen that has no control, so an empty guard is visible', async () => {
    await render(<View />);
    expect(pressableCount()).toBe(0);
    expect(deadControls()).toEqual([]);
  });
});
