/**
 * Coverage for the external link wrapper.
 */
import { render, screen } from '@testing-library/react-native';

import { ExternalLink } from '@/components/external-link';

describe('<ExternalLink>', () => {
  test('renders its children', async () => {
    await render(<ExternalLink href="https://docs.expo.dev">Docs</ExternalLink>);
    expect(screen.getByText('Docs')).toBeTruthy();
  });
});
