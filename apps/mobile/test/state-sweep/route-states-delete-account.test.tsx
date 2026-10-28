/**
 * Feature 008 (T804) - the Delete account sheet owes the traveller what every state of every
 * route owes (FR-064; the state sweep): no control that does nothing, no coming-soon control
 * out of place, and at most the primaries the screen is allowed. This sheet has NO primary: its
 * one action is destructive and Cancel is text.
 */
import { render, screen } from '@testing-library/react-native';

import DeleteAccountScreen from '@/app/modal/delete-account';
import { ApiRequestError } from '@/lib/api-client';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
const mockMutation = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null as unknown,
};
jest.mock('@/features/auth/use-delete-account', () => ({
  useDeleteAccount: () => mockMutation,
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

beforeEach(() => {
  mockMutation.isPending = false;
  mockMutation.error = null;
});

function expectHealthy() {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls()).toEqual([]);
}

describe('The delete-account sheet: no control is a dead end', () => {
  it('the form: Cancel and the destructive action, no primary', async () => {
    await render(<DeleteAccountScreen />);
    expect(screen.getByTestId('delete-account-screen')).toBeTruthy();
    expectHealthy();
  });

  it('while the request runs: still no dead control (the action is busy, not dead)', async () => {
    mockMutation.isPending = true;
    await render(<DeleteAccountScreen />);
    expectHealthy();
  });

  it('after a refusal: the words, and the same two controls', async () => {
    mockMutation.error = new ApiRequestError(0, { code: 'NETWORK', message: 'x' });
    await render(<DeleteAccountScreen />);
    expect(screen.getByTestId('delete-account-error')).toBeTruthy();
    expectHealthy();
  });
});
