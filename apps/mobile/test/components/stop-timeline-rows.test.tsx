/**
 * T545 - the small pieces of the timeline (contract C5-20; spec FR-041, FR-074, FR-076;
 * screens.md "Trip"): `TransitRow` (a dotted segment and the distance to the next stop, absent
 * with no distance), `AddStopRow` (the dashed row at the end, `trip-add-stop`), `NowChip` (the
 * coral dot and "Now") and `StopThumb` (the traveller's picture of a city, or the generated
 * thumbnail with the country's code). What Jest can say is the structure, the names, the
 * decoration hidden from assistive technology and the absence of fixed heights.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Localization from 'expo-localization';
import { StyleSheet } from 'react-native';

import { AddStopRow } from '@/components/trip/add-stop-row';
import { NowChip } from '@/components/trip/now-chip';
import { StopThumb } from '@/components/trip/stop-thumb';
import { TransitRow } from '@/components/trip/transit-row';

import { glyphNamesIn } from '../helpers/icons';

// A View that carries every prop, so a test reads `source` and `recyclingKey`.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});

const hidden = { includeHiddenElements: true };
const flat = (id: string) =>
  (StyleSheet.flatten(screen.getByTestId(id, hidden).props.style) ?? {}) as Record<
    string,
    unknown
  >;

afterEach(() => jest.restoreAllMocks());

describe('<TransitRow>', () => {
  test("says the distance in kilometres, in the device's grouping", async () => {
    await render(<TransitRow stopId="s2" km={313.2} />);
    expect(screen.getByText('313 km', hidden)).toBeTruthy();
    await screen.rerender(<TransitRow stopId="s2" km={1234.6} />);
    expect(screen.getByText('1,235 km', hidden)).toBeTruthy();
  });

  test('stays in kilometres on a device that measures in miles', async () => {
    jest.mocked(Localization.getLocales).mockReturnValue([
      {
        languageTag: 'en-US',
        languageCode: 'en',
        regionCode: 'US',
        textDirection: 'ltr',
        decimalSeparator: '.',
        digitGroupingSeparator: ',',
        currencyCode: 'USD',
        currencySymbol: '$',
        measurementSystem: 'us',
        temperatureUnit: 'fahrenheit',
      },
    ] as never);
    await render(<TransitRow stopId="s2" km={160.9} />);
    expect(screen.getByText('161 km', hidden)).toBeTruthy();
  });

  test('is omitted when there is no distance: an unplaced stop is never guessed', async () => {
    await render(<TransitRow stopId="s2" km={null} />);
    expect(screen.queryByTestId('stop-transit-s2', hidden)).toBeNull();
  });

  test("is decoration: hidden from assistive technology, the distance is in the stop's own name", async () => {
    await render(<TransitRow stopId="s2" km={313} />);
    const row = screen.getByTestId('stop-transit-s2', hidden);
    expect(row.props.accessibilityElementsHidden).toBe(true);
    expect(row.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByText('313 km')).toBeNull();
  });

  test('is at least 36 dp tall and grows with the text, with a dotted spine beside the words', async () => {
    await render(<TransitRow stopId="s2" km={313} />);
    expect(flat('stop-transit-s2').minHeight).toBe(36);
    expect(flat('stop-transit-s2').height).toBeUndefined();
    expect(screen.getByTestId('stop-transit-spine-s2', hidden)).toBeTruthy();
  });

  test('draws a route glyph, not a mode of travel: the app does not know how the traveller moves', async () => {
    await render(<TransitRow stopId="s2" km={313} />);
    expect(glyphNamesIn()).toEqual(['route']);
  });
});

describe('<AddStopRow>', () => {
  test('keeps `trip-add-stop` and the name "Add stop", and is one button', async () => {
    const onPress = jest.fn();
    await render(<AddStopRow onPress={onPress} />);
    const row = screen.getByTestId('trip-add-stop');
    expect(row.props.accessibilityLabel).toBe('Add stop');
    expect(row.props.accessibilityRole).toBe('button');
    expect(screen.getAllByLabelText('Add stop')).toHaveLength(1);
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('says "Add stop" in words, with a plus', async () => {
    await render(<AddStopRow onPress={jest.fn()} />);
    expect(
      within(screen.getByTestId('trip-add-stop')).getByText('Add stop'),
    ).toBeTruthy();
    expect(glyphNamesIn()).toEqual(['plus']);
  });

  test('is a dashed 2 dp outline at least 52 dp tall, which grows with the text', async () => {
    await render(<AddStopRow onPress={jest.fn()} />);
    const style = flat('trip-add-stop');
    expect(style).toMatchObject({ borderWidth: 2, borderStyle: 'dashed' });
    expect(style.minHeight).toBeGreaterThanOrEqual(52);
    expect(style.height).toBeUndefined();
  });
});

describe('<NowChip>', () => {
  test('says "Now" with the coral dot, as one element', async () => {
    await render(<NowChip stopId="s2" />);
    const chip = screen.getByTestId('stop-now-s2');
    expect(chip.props.accessibilityLabel).toBe('Now');
    expect(within(chip).getByText('Now')).toBeTruthy();
    expect(
      screen.getByTestId('stop-now-s2-dot', hidden).props.accessibilityElementsHidden,
    ).toBe(true);
  });
});

describe('<StopThumb> (a picture of the city, if the traveller has one)', () => {
  const props = { stopId: 's2', cityId: 7, iso2: 'PT', place: 'Sintra' };

  test("is the traveller's own photograph when there is one, cover-fitted and decorative", async () => {
    await render(<StopThumb {...props} uri="file:///thumbs/p.thumb.jpg" />);
    const image = screen.getByTestId('stop-thumb-s2-photo', hidden);
    expect(image.props.source).toEqual({ uri: 'file:///thumbs/p.thumb.jpg' });
    expect(image.props.contentFit).toBe('cover');
    expect(screen.queryByTestId('stop-thumb-s2-generated', hidden)).toBeNull();
    expect(
      screen.getByTestId('stop-thumb-s2', hidden).props.accessibilityElementsHidden,
    ).toBe(true);
  });

  test("is the generated thumbnail with the country's code when there is none", async () => {
    await render(<StopThumb {...props} uri={null} />);
    expect(screen.getByTestId('stop-thumb-s2-generated', hidden)).toBeTruthy();
    expect(screen.getByTestId('stop-thumb-s2-generated-glyph', hidden)).toHaveTextContent(
      'PT',
    );
  });

  test('a city with no country code shows the first letter of its name', async () => {
    await render(<StopThumb {...props} iso2={null} uri={null} />);
    expect(screen.getByTestId('stop-thumb-s2-generated-glyph', hidden)).toHaveTextContent(
      'S',
    );
  });

  test('a photograph that will not draw falls back to the generated thumbnail', async () => {
    await render(<StopThumb {...props} uri="file:///thumbs/p.thumb.jpg" />);
    await fireEvent(screen.getByTestId('stop-thumb-s2-photo', hidden), 'error', {});
    expect(screen.getByTestId('stop-thumb-s2-generated', hidden)).toBeTruthy();
    expect(screen.queryByTestId('stop-thumb-s2-photo', hidden)).toBeNull();
  });

  test('is a 56 dp rounded square', async () => {
    await render(<StopThumb {...props} uri={null} />);
    expect(flat('stop-thumb-s2')).toMatchObject({
      width: 56,
      height: 56,
      borderRadius: 16,
    });
  });
});
