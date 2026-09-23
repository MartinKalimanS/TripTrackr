/**
 * Coverage for the web-only version badge.
 *
 * Lives in test/ rather than beside the component only for symmetry with the
 * other non-colocated suites; the component itself is not a route.
 */
import { render, screen } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import { WebBadge } from '@/components/web-badge';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

describe('<WebBadge>', () => {
  test('renders the Expo version it was built against', async () => {
    await render(<WebBadge />);
    expect(screen.getByText(/^v\d+\./)).toBeTruthy();
  });

  test('renders in dark mode without falling over', async () => {
    (useColorScheme as unknown as jest.Mock).mockReturnValue('dark');
    await render(<WebBadge />);
    expect(screen.getByText(/^v\d+\./)).toBeTruthy();
  });
});
