/**
 * Every URL and address the app shows as legal or support information (spec 010; FR-004). One
 * base URL, so the store-launch step changes them in one place. `EXPO_PUBLIC_*` is public and
 * inlined at build time by Expo (dot access, no destructuring).
 */
const DEFAULT_BASE_URL = 'https://triptrackr.app';

function baseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_LEGAL_BASE_URL?.trim();
  return (configured || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export interface LegalLink {
  id: 'privacy' | 'terms' | 'delete-account' | 'support';
  title: string;
  url: string;
  /** `mailto:` links go to the mail app, not the in-app browser. */
  external: boolean;
}

export const SUPPORT_EMAIL = 'support@triptrackr.app';

export function legalLinks(): readonly LegalLink[] {
  const base = baseUrl();
  return [
    { id: 'privacy', title: 'Privacy Policy', url: `${base}/privacy`, external: false },
    { id: 'terms', title: 'Terms of Service', url: `${base}/terms`, external: false },
    {
      id: 'delete-account',
      title: 'Delete your account (web)',
      url: `${base}/delete-account`,
      external: false,
    },
    {
      id: 'support',
      title: 'Support',
      url: `mailto:${SUPPORT_EMAIL}`,
      external: true,
    },
  ];
}
