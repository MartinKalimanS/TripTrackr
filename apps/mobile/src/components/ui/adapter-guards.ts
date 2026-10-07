/**
 * Development-time guards shared by the control adapters (`Tappable`, `Button`,
 * `HeaderBackButton`): contract C4-6 rule 4 (every control has an accessible name) and
 * data-model section 6 (`busy` and `disabled` are mutually exclusive).
 *
 * TypeScript already requires `accessibilityLabel`; these catch what it cannot (an empty
 * string, a plain-JavaScript caller, a prop spread). They throw only under `__DEV__`, so
 * a release build never crashes on a cosmetic mistake: it simply behaves as written.
 */

export function assertAccessibleName(component: string, label: unknown): void {
  if (__DEV__ && (typeof label !== 'string' || label.trim() === '')) {
    throw new Error(
      `${component}: \`accessibilityLabel\` is required (contract C4-6). A control ` +
        'without an accessible name is invisible to a screen reader.',
    );
  }
}

export function assertNotBusyAndDisabled(
  component: string,
  busy: boolean | undefined,
  disabled: boolean | undefined,
): void {
  if (__DEV__ && busy && disabled) {
    throw new Error(
      `${component}: \`busy\` and \`disabled\` are mutually exclusive (data-model section 6). ` +
        'A control cannot be both working and unavailable.',
    );
  }
}
