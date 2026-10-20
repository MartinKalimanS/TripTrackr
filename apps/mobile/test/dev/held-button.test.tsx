/**
 * T524 - `HeldButton`, the gallery's fixture for a button with a finger on it, must be the
 * real button's pressed look and not a second opinion. The test presses a real `Button`
 * (`touchDown`) in every variant and every theme, at both scales, and compares the style of the
 * host node with the fixture's, key by key.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HeldButton } from '@/components/dev/held-button';
import { AppearanceScope } from '@/components/ui/appearance-scope';
import { Button } from '@/components/ui/button';
import { BUTTON_VARIANTS } from '@/components/ui/button-look';
import { PaletteNames } from '@/theme';

import { touchDown } from '../helpers/touch';

const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style as never) as Record<
    string,
    unknown
  >;

const CASES = PaletteNames.flatMap((theme) =>
  [1, 2].flatMap((scale) =>
    BUTTON_VARIANTS.map((variant) => [theme, scale, variant] as const),
  ),
);

describe('HeldButton is the pressed look of Button', () => {
  test.each(CASES)('%s at scale %i: %s', async (theme, scale, variant) => {
    await render(
      <AppearanceScope theme={theme} fontScale={scale}>
        <Button variant={variant} accessibilityLabel="Real" testID="real">
          Label
        </Button>
        <HeldButton variant={variant} testID="held">
          Label
        </HeldButton>
      </AppearanceScope>,
    );

    await touchDown(screen.getByTestId('real'));

    expect(styleOf('held')).toEqual(styleOf('real'));
  });

  test('it says what it is to a screen reader and is not a control', async () => {
    await render(
      <HeldButton variant="primary" testID="held">
        Save trip
      </HeldButton>,
    );
    const held = screen.getByTestId('held');
    expect(held.props.accessibilityLabel).toBe('Save trip, shown held down');
    expect(held.props.accessibilityRole).toBeUndefined();
    expect(held.props.onPress).toBeUndefined();
  });
});
