/** Spec 010 (S-07; FR-003, FR-004): the link set is one module, derived from one base URL. */
import { SUPPORT_EMAIL, legalLinks } from '@/config/legal-links';

const ORIGINAL = process.env.EXPO_PUBLIC_LEGAL_BASE_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_LEGAL_BASE_URL;
  else process.env.EXPO_PUBLIC_LEGAL_BASE_URL = ORIGINAL;
});

describe('legal links', () => {
  it('is the pinned link set under the default base URL', () => {
    delete process.env.EXPO_PUBLIC_LEGAL_BASE_URL;
    expect(legalLinks().map(({ id, url, external }) => [id, url, external])).toEqual([
      ['privacy', 'https://triptrackr.app/privacy', false],
      ['terms', 'https://triptrackr.app/terms', false],
      ['delete-account', 'https://triptrackr.app/delete-account', false],
      ['support', `mailto:${SUPPORT_EMAIL}`, true],
    ]);
  });

  it('follows the configured base URL and drops trailing slashes', () => {
    process.env.EXPO_PUBLIC_LEGAL_BASE_URL = ' https://example.org/legal// ';
    const urls = legalLinks().map((link) => link.url);
    expect(urls[0]).toBe('https://example.org/legal/privacy');
    expect(urls[2]).toBe('https://example.org/legal/delete-account');
  });

  it('falls back to the default when the setting is blank', () => {
    process.env.EXPO_PUBLIC_LEGAL_BASE_URL = '  ';
    expect(legalLinks()[0]?.url).toBe('https://triptrackr.app/privacy');
  });
});
