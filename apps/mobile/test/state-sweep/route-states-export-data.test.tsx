/**
 * Spec 009 (S-06 mobile) - the Export my data sheet owes the traveller what every state of every
 * route owes (FR-064; the state sweep): no control that does nothing, no coming-soon control out
 * of place, and at most the one primary the phase is allowed.
 */
import { render, screen } from '@testing-library/react-native';

import ExportDataScreen from '@/app/modal/export-data';
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
const mockExport = {
  phase: 'form' as 'form' | 'pending' | 'ready' | 'ended',
  downloadUrl: null as string | null,
  isStarting: false,
  error: null as unknown,
  start: jest.fn(),
  restart: jest.fn(),
};
jest.mock('@/features/account/use-data-export', () => ({
  useDataExport: () => mockExport,
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

beforeEach(() => {
  mockExport.phase = 'form';
  mockExport.downloadUrl = null;
  mockExport.isStarting = false;
  mockExport.error = null;
});

function expectHealthy(primaries: number) {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls()).toHaveLength(primaries);
}

describe('The export-data sheet: no control is a dead end', () => {
  it('the form: Cancel and one primary', async () => {
    await render(<ExportDataScreen />);
    expect(screen.getByTestId('export-data-screen')).toBeTruthy();
    expectHealthy(1);
  });

  it('while the request runs: busy, not dead', async () => {
    mockExport.isStarting = true;
    await render(<ExportDataScreen />);
    expectHealthy(1);
  });

  it('after a refusal: the words, and the same controls', async () => {
    mockExport.error = new ApiRequestError(0, { code: 'NETWORK', message: 'x' });
    await render(<ExportDataScreen />);
    expect(screen.getByTestId('export-data-error')).toBeTruthy();
    expectHealthy(1);
  });

  it('pending: the words, and a Close that works', async () => {
    mockExport.phase = 'pending';
    await render(<ExportDataScreen />);
    expect(screen.getByTestId('export-data-pending')).toBeTruthy();
    expectHealthy(1);
  });

  it('ready: Download is the primary', async () => {
    mockExport.phase = 'ready';
    mockExport.downloadUrl = 'https://files.example.com/a.zip';
    await render(<ExportDataScreen />);
    expectHealthy(1);
  });

  it('ended: it says so and offers to ask again', async () => {
    mockExport.phase = 'ended';
    await render(<ExportDataScreen />);
    expect(screen.getByTestId('export-data-ended')).toBeTruthy();
    expectHealthy(1);
  });
});
