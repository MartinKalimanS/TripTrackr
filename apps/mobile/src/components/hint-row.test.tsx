/**
 * Coverage for the restyled HintRow (T027) — the recessed code chip.
 */
import { render, screen } from '@testing-library/react-native';

import { HintRow } from './hint-row';

describe('<HintRow>', () => {
  test('renders the supplied title and hint', async () => {
    await render(<HintRow title="Try editing" hint="src/app/index.tsx" />);
    expect(screen.getByText('Try editing')).toBeTruthy();
    expect(screen.getByText('src/app/index.tsx')).toBeTruthy();
  });

  test('falls back to its defaults', async () => {
    await render(<HintRow />);
    expect(screen.getByText('Try editing')).toBeTruthy();
    expect(screen.getByText('app/index.tsx')).toBeTruthy();
  });
});
