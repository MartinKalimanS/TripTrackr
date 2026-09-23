/**
 * R009 — `trip/[id]`, `modal/add-trip`, and `+not-found` placeholders.
 *
 * The trip detail (T068) and the add-trip form (T066) are US1 work; these
 * screens exist so the routes mount, the params flow, and every state a
 * traveller can reach is styled (FR-027) — including the one where the URL
 * points at nothing.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import NotFoundScreen from '@/app/+not-found';
import AddTripScreen from '@/app/modal/add-trip';
import TripScreen from '@/app/trip/[id]/index';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: 'trip-42' };

jest.mock('expo-router', () => {
  const { Pressable, Text } = require('react-native');
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: mockBack,
      replace: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockParams,
    // A Link is a Pressable that navigates; recording the href is what matters.
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <Pressable testID={`link:${href}`} {...rest}>
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </Pressable>
    ),
  };
});

beforeEach(() => {
  mockParams = { id: 'trip-42' };
});

describe('<TripScreen> — trip/[id]', () => {
  test('reads the trip id from the route params', async () => {
    await render(<TripScreen />);
    expect(screen.getByText(/trip-42/)).toBeTruthy();
  });

  test('shows a designed loading state until the trip is fetched (FR-027)', async () => {
    // US1 T068 replaces this with the real query; until then the screen must
    // still present a styled state rather than a blank page.
    await render(<TripScreen />);
    expect(screen.getByLabelText(/Loading trip/)).toBeTruthy();
  });

  test('handles an array param without crashing — expo-router can hand back one', async () => {
    mockParams = { id: ['a', 'b'] as unknown as string };
    await render(<TripScreen />);
    expect(screen.getByText(/\ba\b/)).toBeTruthy();
  });

  test('offers a way back to the tabs', async () => {
    await render(<TripScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('<AddTripScreen> — modal/add-trip', () => {
  test('renders a trip name field composed from <TextField>', async () => {
    await render(<AddTripScreen />);
    expect(screen.getByLabelText('Trip name')).toBeTruthy();
  });

  test('keeps what the traveller types', async () => {
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Porto in May');
    expect(screen.getByLabelText('Trip name').props.value).toBe('Porto in May');
  });

  test('offers a labelled save action, inert until US1 wires the mutation', async () => {
    await render(<AddTripScreen />);
    expect(screen.getByLabelText('Save trip').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  test('offers a way to dismiss the modal', async () => {
    await render(<AddTripScreen />);
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('<NotFoundScreen> — +not-found', () => {
  test('is a designed state, not a bare default (FR-027)', async () => {
    await render(<NotFoundScreen />);
    expect(screen.getByText('This page does not exist')).toBeTruthy();
  });

  test('links back to the root', async () => {
    await render(<NotFoundScreen />);
    expect(screen.getByTestId('link:/')).toBeTruthy();
    expect(screen.getByText('Back to your globe')).toBeTruthy();
  });
});
