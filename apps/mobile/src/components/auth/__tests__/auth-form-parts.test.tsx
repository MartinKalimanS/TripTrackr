/**
 * The small parts of the pictured Sign in and Create account screens (F12, T555; UI-SPEC 7,
 * `more/auth.png`, `register.png`): the error summary that names each problem and links to its
 * field, the password-rule line that is a word and an icon, the privacy promise, and the
 * Sign in / Create account switch of the header. Colour never carries the meaning (FR-025).
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { glyphNamesIn } from '../../../../test/helpers/icons';
import { AuthSwitchLink } from '../auth-switch-link';
import { ErrorSummary, summaryTitle } from '../error-summary';
import { PrivacyPromise } from '../privacy-promise';
import { PasswordRule } from '../password-rule';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

describe('summaryTitle', () => {
  test.each([
    [1, 'sign in', 'Fix 1 thing to sign in'],
    [2, 'sign in', 'Fix 2 things to sign in'],
    [4, 'create your account', 'Fix 4 things to create your account'],
  ])('%i problems, to %s', (count, goal, title) => {
    expect(summaryTitle(count, goal)).toBe(title);
  });
});

describe('<ErrorSummary>', () => {
  const items = [
    { key: 'email', label: 'Email', message: 'Enter a valid email address.' },
    { key: 'password', label: 'Password', message: 'Enter your password.' },
  ];

  test('draws nothing without a problem', async () => {
    await render(<ErrorSummary goal="sign in" items={[]} onSelect={jest.fn()} />);
    expect(screen.queryByTestId('auth-error-summary')).toBeNull();
  });

  test('is an alert with an icon, a count in words and one line per problem: field, colon, sentence', async () => {
    const speak = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(<ErrorSummary goal="sign in" items={items} onSelect={jest.fn()} />);
    const summary = screen.getByTestId('auth-error-summary');
    expect(summary.props.accessibilityRole).toBe('alert');
    expect(summary.props.accessibilityLiveRegion).toBe('assertive');
    expect(within(summary).getByText('Fix 2 things to sign in')).toBeTruthy();
    expect(within(summary).getByText('Email: Enter a valid email address.')).toBeTruthy();
    expect(within(summary).getByText('Password: Enter your password.')).toBeTruthy();
    // An icon beside the title: the meaning is never colour alone.
    expect(glyphNamesIn(summary)).toContain('alert');
    expect(speak).toHaveBeenCalledWith(
      expect.stringContaining('Fix 2 things to sign in'),
    );
    speak.mockRestore();
  });

  test('each line is a link that moves to its field', async () => {
    const onSelect = jest.fn();
    await render(<ErrorSummary goal="sign in" items={items} onSelect={onSelect} />);
    const link = screen.getByLabelText('Password: Enter your password.');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityHint).toBe('Moves to the Password field');
    await fireEvent.press(link);
    expect(onSelect).toHaveBeenCalledWith('password');
  });

  test('the lines are underlined as well as inked', async () => {
    await render(<ErrorSummary goal="sign in" items={items} onSelect={jest.fn()} />);
    expect(
      String(screen.getByText('Email: Enter a valid email address.').props.className),
    ).toContain('underline');
  });
});

describe('<PasswordRule>', () => {
  test('unmet: the words and a neutral icon, not announced as done', async () => {
    await render(<PasswordRule met={false} text="At least 12 characters" />);
    const rule = screen.getByTestId('password-rule');
    expect(within(rule).getByText('At least 12 characters')).toBeTruthy();
    expect(rule.props.accessibilityLabel).toBe('At least 12 characters, not met yet');
    expect(glyphNamesIn(rule)).toEqual(['info']);
  });

  test('met: a check icon, and the words say met', async () => {
    await render(<PasswordRule met text="At least 12 characters" />);
    const rule = screen.getByTestId('password-rule');
    expect(rule.props.accessibilityLabel).toBe('At least 12 characters, met');
    expect(glyphNamesIn(rule)).toEqual(['check-circle']);
  });
});

describe('<PrivacyPromise>', () => {
  test('says expenses and documents stay private, with a lock', async () => {
    await render(<PrivacyPromise />);
    const line = screen.getByTestId('privacy-promise');
    expect(
      within(line).getByText('Expenses and documents stay private to you.'),
    ).toBeTruthy();
    expect(glyphNamesIn(line)).toEqual(['lock']);
  });
});

describe('<AuthSwitchLink>', () => {
  beforeEach(() => mockReplace.mockReset());

  test('Sign in offers Create account and replaces the screen, so Back still lands on Welcome', async () => {
    await render(<AuthSwitchLink to="register" />);
    const link = screen.getByTestId('auth-switch-link');
    expect(link.props.accessibilityLabel).toBe('Create account');
    await fireEvent.press(link);
    expect(mockReplace).toHaveBeenCalledWith('/register');
  });

  test('Create account offers Sign in', async () => {
    await render(<AuthSwitchLink to="login" />);
    expect(screen.getByTestId('auth-switch-link').props.accessibilityLabel).toBe(
      'Sign in',
    );
    await fireEvent.press(screen.getByTestId('auth-switch-link'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
