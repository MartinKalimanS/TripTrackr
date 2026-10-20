/**
 * Owner answer Q-11 (feature 005, FR-080 as amended): a control the pictures show for a
 * capability the app does not have is drawn as pictured and is a real button whose ONLY effect
 * is one "<Thing> is coming soon" toast. These suites pin the accessibility contract (role,
 * name, hint, 44 dp, focus order), the toast, and that nothing else can happen (no router, no
 * store, no network).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Text, View } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';

import { appearance } from '../../../test/helpers/appearance';
import { ComingSoonButton, useComingSoon } from './coming-soon-button';
import { TOAST_DURATION_MS } from './toast';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn() }),
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
};
const { router } = jest.requireMock('expo-router') as {
  router: { push: jest.Mock; navigate: jest.Mock; replace: jest.Mock };
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  mockToast.show.mockClear();
  mockToast.hide.mockClear();
  Object.values(router).forEach((fn) => fn.mockClear());
});

/** Renders what the toast the control asked for would show. */
async function toastBody() {
  const request = mockToast.show.mock.calls.at(-1)?.[0] as {
    id?: string;
    duration: number;
    component: (props: Record<string, unknown>) => React.ReactElement;
  };
  await render(
    request.component({
      id: request.id,
      index: 0,
      total: { value: 1 },
      heights: { value: {} },
      show: jest.fn(),
      hide: jest.fn(),
    }),
  );
  return request;
}

describe('<ComingSoonButton> - drawn as pictured, a real button', () => {
  test('is a button named from the picture, hinted, with the id coming-soon-<name>', async () => {
    await render(<ComingSoonButton name="search" label="Search" icon="search" />);
    const button = screen.getByTestId('coming-soon-search');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Search');
    expect(button.props.accessibilityHint).toBe('Not available yet');
    expect(screen.getByRole('button', { name: 'Search' })).toBe(button);
  });

  test('is not announced as disabled: it can be focused and pressed', async () => {
    await render(<ComingSoonButton name="share" label="Share" icon="share" />);
    const button = screen.getByTestId('coming-soon-share');
    expect(button.props.accessibilityState).toMatchObject({ disabled: false });
    expect(button.props.accessible).not.toBe(false);
  });

  test('is a 44 dp disc and its target reaches the platform floor', async () => {
    await render(<ComingSoonButton name="search" label="Search" icon="search" />);
    const button = screen.getByTestId('coming-soon-search');
    const disc = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style.flat(Infinity).filter(Boolean))
      : button.props.style;
    expect(disc).toMatchObject({ width: 44, height: 44 });
    const slop = button.props.hitSlop;
    expect(44 + slop.left + slop.right).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(44 + slop.top + slop.bottom).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('draws the glyph of the picture, as decoration', async () => {
    await render(<ComingSoonButton name="search" label="Search" icon="search" />);
    expect(
      screen.getByTestId('coming-soon-search-icon', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  test('takes the focus order of the place it is rendered in', async () => {
    await render(
      <View>
        <Text>before</Text>
        <ComingSoonButton name="search" label="Search" icon="search" />
        <ComingSoonButton name="share" label="Share" icon="share" />
      </View>,
    );
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(names).toEqual(['Search', 'Share']);
  });
});

describe('<ComingSoonButton> - its only effect is one toast', () => {
  test('a press shows "<Label> is coming soon" once, as the Toast adapter', async () => {
    await render(<ComingSoonButton name="search" label="Search" icon="search" />);
    expect(mockToast.show).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('coming-soon-search'));
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    const request = await toastBody();
    expect(request.duration).toBe(TOAST_DURATION_MS);
    expect(screen.getByText('Search is coming soon')).toBeTruthy();
    expect(screen.queryByText('Undo')).toBeNull();
  });

  test('"thing" names the subject of the sentence when the label is not it', async () => {
    await render(
      <ComingSoonButton name="more" label="More" thing="Trip actions" icon="ellipsis" />,
    );
    await fireEvent.press(screen.getByTestId('coming-soon-more'));
    await toastBody();
    expect(screen.getByText('Trip actions is coming soon')).toBeTruthy();
  });

  test('every press asks for the same toast id, so the kit never stacks a second one', async () => {
    await render(
      <View>
        <ComingSoonButton name="search" label="Search" icon="search" />
        <ComingSoonButton name="share" label="Share" icon="share" />
      </View>,
    );
    await fireEvent.press(screen.getByTestId('coming-soon-search'));
    await fireEvent.press(screen.getByTestId('coming-soon-search'));
    await fireEvent.press(screen.getByTestId('coming-soon-share'));
    const ids = mockToast.show.mock.calls.map(([request]) => request.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe('coming-soon');
  });

  test('never navigates', async () => {
    await render(<ComingSoonButton name="search" label="Search" icon="search" />);
    await fireEvent.press(screen.getByTestId('coming-soon-search'));
    Object.values(router).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  test('its source reaches no router, no store, no repository and no network', () => {
    const source = readFileSync(join(__dirname, 'coming-soon-button.tsx'), 'utf8');
    const imports = source.match(/from '[^']+'/g) ?? [];
    expect(
      imports.filter((i) => /router|db|repositor|sync|features|api|fetch/i.test(i)),
    ).toEqual([]);
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest/);
  });
});

describe('useComingSoon', () => {
  test('gives a press handler that is the same function between renders', async () => {
    const seen: (() => void)[] = [];
    function Probe() {
      seen.push(useComingSoon('Search'));
      return null;
    }
    const { rerender } = await render(<Probe />);
    await rerender(<Probe />);
    expect(seen[0]).toBe(seen.at(-1));
    seen[0]!();
    expect(mockToast.show).toHaveBeenCalledTimes(1);
  });
});
