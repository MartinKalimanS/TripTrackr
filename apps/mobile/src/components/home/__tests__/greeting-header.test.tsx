/**
 * T535 - the greeting over the globe (feature 005; FR-014, FR-015, FR-004, FR-077; contract
 * C5-23): the date as a small eyebrow, "Hello, Marta" in the display face with the name as
 * the one serif accent word of the screen, a slot for the sync chip, and a recentre control
 * that exists only when the parent says the globe was moved.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { appearance } from '../../../../test/helpers/appearance';
import { GreetingHeader } from '../greeting-header';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => useAppearance.mockReturnValue(appearance()));

const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);

describe('<GreetingHeader>', () => {
  test('says hello to the traveller by name, the name being the serif accent word', async () => {
    await render(<GreetingHeader name="Marta" today="2026-10-14" />);
    const greeting = screen.getByTestId('home-greeting');
    expect(greeting).toHaveTextContent('Hello, Marta');
    const accent = screen.getByText('Marta');
    expect(tokens(accent.props.className)).toContain('font-serif-italic');
    expect(tokens(greeting.props.className)).toEqual(
      expect.arrayContaining(['font-display-bold']),
    );
  });

  test('the accent is a span inside the sentence, so the sentence still reads whole', async () => {
    await render(<GreetingHeader name="Marta" today="2026-10-14" />);
    expect(screen.getByTestId('home-greeting')).toHaveTextContent(/^Hello, Marta$/);
    expect(screen.getAllByText(/Hello/)).toHaveLength(1);
  });

  test('is announced as a heading and is at most two lines', async () => {
    await render(<GreetingHeader name="Marta" today="2026-10-14" />);
    const greeting = screen.getByTestId('home-greeting');
    expect(greeting.props.accessibilityRole).toBe('header');
    expect(greeting.props.numberOfLines).toBe(2);
  });

  test('a long name stays inside two lines instead of pushing the controls off', async () => {
    await render(
      <GreetingHeader
        name="Maximilian Alexander von Hohenzollern-Sigmaringen"
        today="2026-10-14"
      />,
    );
    expect(screen.getByTestId('home-greeting').props.numberOfLines).toBe(2);
  });

  test('a traveller with no name is simply greeted', async () => {
    await render(<GreetingHeader name={null} today="2026-10-14" />);
    expect(screen.getByTestId('home-greeting')).toHaveTextContent(/^Hello$/);
    await screen.rerender(<GreetingHeader name="   " today="2026-10-14" />);
    expect(screen.getByTestId('home-greeting')).toHaveTextContent(/^Hello$/);
  });

  test('shows today as the eyebrow, in the device language', async () => {
    await render(<GreetingHeader name="Marta" today="2026-10-14" />);
    const date = screen.getByTestId('home-greeting-date');
    expect(date).toHaveTextContent(/Wed/);
    expect(date).toHaveTextContent(/14/);
    expect(date).toHaveTextContent(/Oct/);
    expect(tokens(date.props.className)).toContain('text-muted');
  });

  test('the date is read to a screen reader once, with the greeting', async () => {
    await render(<GreetingHeader name="Marta" today="2026-10-14" />);
    expect(screen.getByTestId('home-greeting-date').props.accessibilityRole).not.toBe(
      'header',
    );
  });

  test('has a slot at the right for the sync chip', async () => {
    await render(
      <GreetingHeader
        name="Marta"
        today="2026-10-14"
        trailing={<Text testID="chip">3 waiting</Text>}
      />,
    );
    expect(screen.getByTestId('chip')).toBeOnTheScreen();
  });

  test('has no recentre control until the globe has been moved', async () => {
    await render(<GreetingHeader name="Marta" today="2026-10-14" />);
    expect(screen.queryByTestId('home-recentre')).toBeNull();
  });

  test('offers a named recentre control once the parent gives it a handler', async () => {
    const onRecentre = jest.fn();
    await render(
      <GreetingHeader name="Marta" today="2026-10-14" onRecentre={onRecentre} />,
    );
    const recentre = screen.getByTestId('home-recentre');
    expect(recentre.props.accessibilityRole).toBe('button');
    expect(recentre.props.accessibilityLabel).toBe('Recentre the globe');
    await fireEvent.press(recentre);
    expect(onRecentre).toHaveBeenCalledTimes(1);
  });
});
