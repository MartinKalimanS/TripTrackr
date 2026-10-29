/** Spec 010 (S-07) - the About sheet owes what every route owes (FR-064; the state sweep). */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import AboutScreen from '@/app/modal/about';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

function expectHealthy() {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls()).toHaveLength(1);
}

describe('The About sheet: no control is a dead end', () => {
  it('static: the links and Close, one primary', async () => {
    await render(<AboutScreen />);
    expect(screen.getByTestId('about-screen')).toBeTruthy();
    expectHealthy();
  });

  it('after a link fails: the words, and the same controls', async () => {
    (WebBrowser.openBrowserAsync as jest.Mock).mockRejectedValue(new Error('x'));
    await render(<AboutScreen />);
    await fireEvent.press(screen.getByTestId('about-link-privacy'));
    await waitFor(() => expect(screen.getByTestId('about-link-error')).toBeTruthy());
    expectHealthy();
  });
});
