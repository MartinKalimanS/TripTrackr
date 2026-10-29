/** Spec 010 (S-07; FR-001 to FR-007): the About sheet. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import AboutScreen from '@/app/modal/about';
import { ABOUT_COPY } from '@/features/about/about-copy';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  openBrowser.mockResolvedValue({ type: 'opened' });
});

describe('About sheet', () => {
  it('shows the version, the retention statement and the credits', async () => {
    await render(<AboutScreen />);
    expect(screen.getByTestId('about-version')).toBeTruthy();
    expect(screen.getByTestId('about-retention').props.children).toContain('90 days');
    expect(screen.getByText(ABOUT_COPY.geonames)).toBeTruthy();
    expect(screen.getByText(ABOUT_COPY.maps)).toBeTruthy();
    expect(screen.getByTestId('about-licences')).toBeTruthy();
  });

  it('opens a web link in the in-app browser', async () => {
    await render(<AboutScreen />);
    await fireEvent.press(screen.getByTestId('about-link-privacy'));
    await waitFor(() =>
      expect(openBrowser).toHaveBeenCalledWith('https://triptrackr.app/privacy'),
    );
  });

  it('opens support in the mail app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<AboutScreen />);
    await fireEvent.press(screen.getByTestId('about-link-support'));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('mailto:support@triptrackr.app'),
    );
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('says so in words when a link cannot open', async () => {
    openBrowser.mockRejectedValue(new Error('no browser'));
    await render(<AboutScreen />);
    await fireEvent.press(screen.getByTestId('about-link-terms'));
    expect(await screen.findByText(ABOUT_COPY.linkFailed)).toBeTruthy();
  });

  it('Close goes back', async () => {
    await render(<AboutScreen />);
    await fireEvent.press(screen.getByTestId('about-save'));
    expect(mockBack).toHaveBeenCalled();
  });
});
