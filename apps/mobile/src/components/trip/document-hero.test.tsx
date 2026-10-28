/**
 * T552 - `DocumentHero`, `BarcodePlate`, `BrightnessBoost` and `DocumentsSkeleton` (FR-050,
 * FR-064; UI-SPEC 9.2; prototype `.scan`, `.qr`): the scan as the hero on a fixed white plate,
 * the pictured brightness line as a coming-soon control, and the ticket-shaped skeleton.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text as RNText } from 'react-native';

import { comingSoonMessage } from '@/components/ui/coming-soon-button';
import { Palettes } from '@/theme';

import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { BarcodePlate, PLATE_PADDING } from './barcode-plate';
import { BrightnessBoost } from './brightness-boost';
import { DocumentHero } from './document-hero';
import { TICKET_MIN_HEIGHT } from './document-ticket';
import { DocumentsSkeleton } from './documents-skeleton';

const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;

afterEach(() => jest.restoreAllMocks());

describe('<BarcodePlate>', () => {
  test.each(['light', 'dark', 'light-contrast', 'dark-contrast'] as const)(
    'is the opaque white of onPhoto with a 16 dp quiet zone in %s',
    async (theme) => {
      mockThemeColors(theme);
      await render(
        <BarcodePlate>
          <RNText>code</RNText>
        </BarcodePlate>,
      );

      const plate = flat(screen.getByTestId('barcode-plate'));
      expect(plate.backgroundColor).toBe(asCss(Palettes[theme].onPhoto));
      expect(asCss(String(plate.backgroundColor))).toBe('#ffffff');
      expect(plate.padding).toBe(PLATE_PADDING);
      expect(PLATE_PADDING).toBe(16);
      for (const key of ['opacity', 'boxShadow', 'shadowColor']) {
        expect(plate).not.toHaveProperty(key);
      }
    },
  );

  test('holds its picture and nothing else: no control, no name of its own', async () => {
    await render(
      <BarcodePlate>
        <RNText>code</RNText>
      </BarcodePlate>,
    );

    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.getByTestId('barcode-plate').props.accessibilityLabel).toBeUndefined();
    expect(within(screen.getByTestId('barcode-plate')).getByText('code')).toBeTruthy();
  });
});

describe('<DocumentHero>', () => {
  test('is a 16 dp card on the second lift, tilted one degree, over the plate with a navy band', async () => {
    mockThemeColors('light');
    await render(
      <DocumentHero kindLabel="Boarding pass" flight="AC834">
        <RNText>picture</RNText>
      </DocumentHero>,
    );

    const hero = flat(screen.getByTestId('document-hero'));
    expect(hero).toMatchObject({ borderRadius: 16, transform: [{ rotate: '-1deg' }] });
    expect(flat(screen.getByTestId('document-hero-band')).backgroundColor).toBe(
      asCss(Palettes.light.accentInk),
    );
    expect(
      within(screen.getByTestId('document-hero')).getByTestId('barcode-plate'),
    ).toBeTruthy();
    expect(screen.getByTestId('document-hero-kind')).toHaveTextContent('Boarding pass');
    expect(screen.getByTestId('document-hero-flight')).toHaveTextContent('AC834');
    expect(screen.getByText('picture')).toBeTruthy();
  });

  test('draws no flight when there is none to say, and is no control', async () => {
    await render(
      <DocumentHero kindLabel="Booking" flight={null}>
        <RNText>picture</RNText>
      </DocumentHero>,
    );

    expect(screen.queryByTestId('document-hero-flight')).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});

describe('<BrightnessBoost>', () => {
  test('is a coming-soon control: a named button, hinted, and its caption claims nothing', async () => {
    await render(<BrightnessBoost />);

    const boost = screen.getByTestId('coming-soon-document-brightness');
    expect(boost.props.accessibilityRole).toBe('button');
    expect(boost.props.accessibilityLabel).toBe('Raise brightness for the code');
    expect(boost.props.accessibilityHint).toBe('Not available yet');
    expect(screen.getByText('Brightness boost')).toBeTruthy();
    expect(screen.queryByText(/is raised/i)).toBeNull();
  });

  test('its press shows the one coming-soon toast and nothing else', async () => {
    const { mockToast } = jest.requireMock('heroui-native') as {
      mockToast: { show: jest.Mock };
    };
    mockToast.show.mockClear();
    await render(<BrightnessBoost />);

    await fireEvent.press(screen.getByTestId('coming-soon-document-brightness'));

    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'coming-soon' }),
    );
    expect(comingSoonMessage('Brightness boost')).toBe('Brightness boost is coming soon');
  });
});

describe('<DocumentsSkeleton>', () => {
  test('is ONE announced progressbar of three ticket-shaped blocks with the ticket’s geometry', async () => {
    await render(<DocumentsSkeleton label="Loading documents" />);

    const region = screen.getByLabelText('Loading documents');
    expect(region.props.accessibilityRole).toBe('progressbar');
    const hidden = { includeHiddenElements: true };
    for (const index of [0, 1, 2]) {
      const bone = screen.getByTestId(`documents-skeleton-ticket-${index}`, hidden);
      expect(flat(bone).height).toBe(TICKET_MIN_HEIGHT);
    }
    expect(screen.queryByTestId('documents-skeleton-ticket-3', hidden)).toBeNull();
    expect(TICKET_MIN_HEIGHT).toBe(104);
  });
});
