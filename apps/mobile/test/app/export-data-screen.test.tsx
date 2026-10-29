/**
 * Spec 009 (S-06 mobile) - the Export my data sheet. The hook is a double with a settable phase;
 * what is pinned is what each phase says, what the sheet asks for, and what it sends.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import ExportDataScreen from '@/app/modal/export-data';
import { ApiRequestError } from '@/lib/api-client';

import { resetKeyboard, setWindow } from '../helpers/keyboard';

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

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

const openURL = jest.spyOn(Linking, 'openURL');

beforeEach(() => {
  setWindow({ width: 390, height: 844 });
  resetKeyboard();
  mockRouter.back.mockClear();
  mockExport.start.mockClear();
  mockExport.restart.mockClear();
  mockExport.phase = 'form';
  mockExport.downloadUrl = null;
  mockExport.isStarting = false;
  mockExport.error = null;
  openURL.mockReset();
  openURL.mockResolvedValue(true);
});

describe('<ExportDataScreen> the form', () => {
  test('says what goes in the zip and how long it lasts', async () => {
    await render(<ExportDataScreen />);
    expect(screen.getByText('Export your data')).toBeTruthy();
    expect(screen.getByText(/photos and documents with their files/i)).toBeTruthy();
    expect(screen.getByText(/24 hours/i)).toBeTruthy();
  });

  test('one secure password field that says Google and Apple accounts leave it empty', async () => {
    await render(<ExportDataScreen />);
    expect(screen.getByTestId('export-data-password').props.secureTextEntry).toBe(true);
    expect(screen.getByText(/signed in with Google or Apple/i)).toBeTruthy();
  });

  test('sends the typed password', async () => {
    await render(<ExportDataScreen />);
    await fireEvent.changeText(screen.getByTestId('export-data-password'), 'my password');
    await fireEvent.press(screen.getByTestId('export-data-save'));
    expect(mockExport.start).toHaveBeenCalledWith('my password');
  });

  test('an empty field sends an empty password', async () => {
    await render(<ExportDataScreen />);
    await fireEvent.press(screen.getByLabelText('Request my data'));
    expect(mockExport.start).toHaveBeenCalledWith('');
  });

  test('cannot be pressed twice while the request runs', async () => {
    mockExport.isStarting = true;
    await render(<ExportDataScreen />);
    const action = screen.getByTestId('export-data-save');
    expect(action.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(action);
    expect(mockExport.start).not.toHaveBeenCalled();
  });

  test('Cancel closes the sheet and sends nothing', async () => {
    await render(<ExportDataScreen />);
    await fireEvent.press(screen.getByTestId('export-data-cancel'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockExport.start).not.toHaveBeenCalled();
  });

  test.each([
    [
      'a wrong or missing password',
      403,
      'REAUTHENTICATION_REQUIRED',
      /Enter your password/,
    ],
    ['no connection', 0, 'NETWORK', /couldn.t reach the server/i],
    ['a server fault', 500, 'INTERNAL', /Nothing was exported/],
  ])('refusal in words: %s', async (_name, status, code, words) => {
    mockExport.error = new ApiRequestError(status, { code, message: code });
    await render(<ExportDataScreen />);
    expect(screen.getByTestId('export-data-error').props.accessibilityRole).toBe('alert');
    expect(screen.getByText(words)).toBeTruthy();
  });

  test('shows no error before anything went wrong', async () => {
    await render(<ExportDataScreen />);
    expect(screen.queryByTestId('export-data-error')).toBeNull();
  });
});

describe('<ExportDataScreen> the other phases', () => {
  test('pending says it keeps going, and its action closes the sheet', async () => {
    mockExport.phase = 'pending';
    await render(<ExportDataScreen />);
    expect(screen.getByTestId('export-data-pending')).toBeTruthy();
    expect(screen.queryByTestId('export-data-password')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  test('ready downloads through the system, and says nothing of the link', async () => {
    mockExport.phase = 'ready';
    mockExport.downloadUrl = 'https://files.example.com/a.zip';
    await render(<ExportDataScreen />);
    expect(screen.getByText('Your file is ready.')).toBeTruthy();
    expect(screen.queryByText(/files\.example\.com/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Download'));
    expect(openURL).toHaveBeenCalledWith('https://files.example.com/a.zip');
  });

  test('ended offers to ask again', async () => {
    mockExport.phase = 'ended';
    await render(<ExportDataScreen />);
    expect(screen.getByTestId('export-data-ended')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Ask again'));
    expect(mockExport.restart).toHaveBeenCalledTimes(1);
  });
});
