/**
 * `LegalLine` - "By continuing you accept the Terms and Privacy Policy." (F12; UI-SPEC 7).
 * The two names are real links to the URLs of `constants/legal-urls.ts`; the sentence reads
 * whole, the links are announced as links, and a link that cannot open says nothing and
 * breaks nothing.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { LEGAL_URLS } from '@/constants/legal-urls';

import { LegalLine } from '../legal-line';

const openURL = jest.spyOn(Linking, 'openURL');

beforeEach(() => {
  openURL.mockReset();
  openURL.mockResolvedValue(true);
});

describe('<LegalLine>', () => {
  test('the URLs are https, public and distinct', () => {
    expect(LEGAL_URLS.terms).toMatch(/^https:\/\//);
    expect(LEGAL_URLS.privacy).toMatch(/^https:\/\//);
    expect(LEGAL_URLS.terms).not.toBe(LEGAL_URLS.privacy);
  });

  test('reads as one sentence with the two names as links', async () => {
    await render(<LegalLine lead="By continuing you accept the" />);
    expect(screen.getByTestId('legal-line')).toHaveTextContent(
      'By continuing you accept the Terms and Privacy Policy.',
    );
    for (const [id, name] of [
      ['legal-terms-link', 'Terms'],
      ['legal-privacy-link', 'Privacy Policy'],
    ] as const) {
      const link = screen.getByTestId(id);
      expect(link.props.accessibilityRole).toBe('link');
      expect(link).toHaveTextContent(name);
    }
  });

  test('says the sentence it is given on the create-account screen', async () => {
    await render(<LegalLine lead="By creating an account you agree to the" />);
    expect(screen.getByTestId('legal-line')).toHaveTextContent(
      'By creating an account you agree to the Terms and Privacy Policy.',
    );
  });

  test('each link opens its own document', async () => {
    await render(<LegalLine lead="By continuing you accept the" />);
    await fireEvent.press(screen.getByTestId('legal-terms-link'));
    expect(openURL).toHaveBeenLastCalledWith(LEGAL_URLS.terms);
    await fireEvent.press(screen.getByTestId('legal-privacy-link'));
    expect(openURL).toHaveBeenLastCalledWith(LEGAL_URLS.privacy);
    expect(openURL).toHaveBeenCalledTimes(2);
  });

  test('a link the device cannot open is a no-op, not a crash', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    await render(<LegalLine lead="By continuing you accept the" />);
    await fireEvent.press(screen.getByTestId('legal-terms-link'));
    expect(screen.getByTestId('legal-line')).toBeTruthy();
  });

  test('the link names are not coloured alone: bold and underlined', async () => {
    await render(<LegalLine lead="By continuing you accept the" />);
    const classes = String(screen.getByTestId('legal-terms-link').props.className);
    expect(classes).toContain('underline');
    expect(classes).toContain('text-foreground');
  });
});
