/**
 * Where the Terms of Service and the Privacy Policy live (F12; store-readiness: "Privacy
 * Policy URL and Terms/EULA URL ... reachable in-app"). The one place a legal link is named:
 * the auth screens read it today, and About reads it when it is built (S07).
 *
 * The host is a PLACEHOLDER until the owner publishes the documents at a public URL
 * (`docs/legal/`, store-readiness rows B; roadmap S32): change the two strings here and
 * nothing else. Both must be `https`, public, with no login and no PDF.
 */
export const LEGAL_URLS = {
  terms: 'https://triptrackr.app/terms',
  privacy: 'https://triptrackr.app/privacy',
} as const;

export type LegalDocument = keyof typeof LEGAL_URLS;
