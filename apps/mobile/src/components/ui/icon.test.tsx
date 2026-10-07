/**
 * T423 - contract C4-8 (`Icon`), research D4-08, FR-008, FR-025.
 *
 * `expo-symbols` is replaced by a view that carries the props it was given, so the test
 * reads what the adapter asked of it (name for both platforms, size, tint). The
 * accessibility contract is asserted on the adapter's own wrapper, which is where it
 * lives on both platforms: the Android `SymbolView` forwards only `style`.
 */
import { render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';

import { Icon, type IconTone } from './icon';

jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => <View testID="symbol" {...props} />,
  };
});

const NAME = { ios: 'chevron.left', android: 'chevron_left' } as const;

afterEach(() => jest.restoreAllMocks());

// A decorative icon is hidden from assistive technology, and Testing Library's default
// queries honour that, so a test reads it explicitly.
const hidden = { includeHiddenElements: true };
const byId = (id: string) => screen.getByTestId(id, hidden);

describe('<Icon> symbol - D4-08', () => {
  test('hands the symbol both platform names, unchanged', async () => {
    await render(<Icon name={NAME} />);
    expect(byId('symbol').props.name).toEqual(NAME);
  });

  test('is 20 dp unless asked, and accepts 16, 20 and 24', async () => {
    await render(<Icon name={NAME} />);
    expect(byId('symbol').props.size).toBe(20);
    for (const size of [16, 20, 24] as const) {
      await render(<Icon name={NAME} size={size} testID={`icon-${size}`} />);
      expect(screen.getAllByTestId('symbol', hidden).at(-1)?.props.size).toBe(size);
    }
  });

  test('rejects an iOS-only name at compile time', () => {
    // @ts-expect-error - a bare SF Symbol would render on iOS only (v57 reference)
    const bare = <Icon name="chevron.left" />;
    expect(bare).toBeTruthy();
  });
});

describe('<Icon> tone - FR-023, C4-1', () => {
  const TOKENS: Record<IconTone, string> = {
    default: 'foreground',
    muted: 'muted',
    accent: 'accent',
    danger: 'danger',
    success: 'success',
    onAccent: 'accent-foreground',
  };

  test.each(Object.entries(TOKENS) as [IconTone, string][])(
    'tone %s tints with the theme colour %s',
    async (tone, token) => {
      const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
      useThemeColor.mockReturnValue('themed' as never);
      await render(<Icon name={NAME} tone={tone} />);
      expect(useThemeColor).toHaveBeenCalledWith(token);
      expect(byId('symbol').props.tintColor).toBe('themed');
    },
  );

  test('is the default ink unless asked', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    await render(<Icon name={NAME} />);
    expect(useThemeColor).toHaveBeenCalledWith('foreground');
  });
});

describe('<Icon> accessibility - FR-030, contract C4-8', () => {
  test('is decorative by default: hidden from assistive technology', async () => {
    await render(<Icon name={NAME} testID="icon" />);
    const node = byId('icon');
    expect(node.props.accessible).toBe(false);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(node.props.accessibilityLabel).toBeUndefined();
    expect(screen.queryByRole('image')).toBeNull();
  });

  test('is an image with a name when it carries a label', async () => {
    await render(<Icon name={NAME} testID="icon" label="Planning" />);
    const node = byId('icon');
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe('image');
    expect(node.props.accessibilityLabel).toBe('Planning');
    expect(node.props.accessibilityElementsHidden).toBeUndefined();
    expect(node.props.importantForAccessibility).toBeUndefined();
    expect(screen.getByLabelText('Planning')).toBeTruthy();
  });

  test('a blank label is no label: the icon stays decorative', async () => {
    await render(<Icon name={NAME} testID="icon" label="   " />);
    expect(byId('icon').props.accessible).toBe(false);
  });

  test('forwards testID to the node a test finds it by, in both modes', async () => {
    await render(
      <>
        <Icon name={NAME} testID="decorative" />
        <Icon name={NAME} testID="meaningful" label="Back" />
      </>,
    );
    expect(byId('decorative')).toBeTruthy();
    expect(byId('meaningful')).toBeTruthy();
  });
});
