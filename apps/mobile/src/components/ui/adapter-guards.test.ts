/**
 * The development-time guards every control adapter shares (contract C4-6 rule 4,
 * data-model section 6). They throw under `__DEV__` (always true under Jest) so a
 * missing accessible name or a contradictory state is found when the screen is written,
 * not by a traveller.
 */
import { assertAccessibleName, assertNotBusyAndDisabled } from './adapter-guards';

describe('assertAccessibleName', () => {
  test('accepts a non-empty name', () => {
    expect(() => assertAccessibleName('Button', 'Save trip')).not.toThrow();
  });

  test.each([undefined, null, '', '   ', 42])('rejects %p', (label) => {
    expect(() => assertAccessibleName('Button', label)).toThrow(
      /Button.*accessibilityLabel/,
    );
  });
});

describe('assertNotBusyAndDisabled', () => {
  test('accepts either state alone, or neither', () => {
    expect(() => assertNotBusyAndDisabled('Button', true, false)).not.toThrow();
    expect(() => assertNotBusyAndDisabled('Button', false, true)).not.toThrow();
    expect(() => assertNotBusyAndDisabled('Button', undefined, undefined)).not.toThrow();
  });

  test('rejects both', () => {
    expect(() => assertNotBusyAndDisabled('Button', true, true)).toThrow(
      /Button.*mutually exclusive/,
    );
  });
});
