/**
 * T540 - `TripCoverArt` (feature 005; FR-008, FR-034, FR-076; research D5-09): what fills the
 * picture slot of a trip card. The photograph the cover rule chose (a thumbnail on the device,
 * drawn by expo-image, recycled by photo id so a recycled list cell never shows the last trip's
 * picture), and, when there is none or it will not draw, the generated cover: the same frame,
 * so nothing jumps. Decoration: hidden from assistive technology, the card names the trip.
 */
import { act, render, screen } from '@testing-library/react-native';

import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';

import { cardModel, withPhoto } from '../../../test/helpers/trip-card-fixture';
import { TripCoverArt } from './trip-cover-art';

// A View that carries every prop, so a test reads `source` and `recyclingKey` and fires `error`.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('@/hooks/use-accessibility-flags');

const hidden = { includeHiddenElements: true };

function setMotion(prefersLessMotion: boolean) {
  (useAccessibilityFlags as jest.Mock).mockReturnValue({
    prefersMoreContrast: false,
    prefersLessMotion,
    prefersLessTransparency: false,
    ready: true,
  });
}

beforeEach(() => setMotion(false));

describe('<TripCoverArt> with a photograph', () => {
  test('draws the thumbnail, recycled by photo id, covering the frame, cached in memory and on disk', async () => {
    await render(<TripCoverArt trip={withPhoto()} />);

    const photo = screen.getByTestId('trip-card-t1-photo', hidden);
    expect(photo.props.source).toEqual({
      uri: 'file:///photos/t1/photo-1.thumb.jpg',
    });
    expect(photo.props.recyclingKey).toBe('photo-1');
    expect(photo.props.contentFit).toBe('cover');
    expect(photo.props.cachePolicy).toBe('memory-disk');
    expect(photo.props.transition).toBe(220);
  });

  test('puts the photograph where the caller says (the hero: 50% 58%), centred otherwise', async () => {
    await render(
      <TripCoverArt trip={withPhoto()} contentPosition={{ left: '50%', top: '58%' }} />,
    );
    expect(
      screen.getByTestId('trip-card-t1-photo', hidden).props.contentPosition,
    ).toEqual({
      left: '50%',
      top: '58%',
    });
  });

  test('a card recycled for another trip names the other photo: the recycling key follows the id', async () => {
    const view = await render(<TripCoverArt trip={withPhoto()} />);
    await view.rerender(
      <TripCoverArt
        trip={withPhoto(
          { id: 't2' },
          { photoId: 'photo-9', thumbnailUri: 'file:///photos/t2/photo-9.thumb.jpg' },
        )}
      />,
    );
    const photo = screen.getByTestId('trip-card-t2-photo', hidden);
    expect(photo.props.recyclingKey).toBe('photo-9');
  });

  test('appears at once under reduced motion: no fade', async () => {
    setMotion(true);
    await render(<TripCoverArt trip={withPhoto()} />);
    expect(screen.getByTestId('trip-card-t1-photo', hidden).props.transition).toBe(0);
  });

  test('is decoration: the frame and the picture are hidden from assistive technology', async () => {
    await render(<TripCoverArt trip={withPhoto()} />);
    for (const id of ['trip-card-t1-cover', 'trip-card-t1-photo']) {
      const node = screen.getByTestId(id, hidden);
      expect(node.props.accessibilityElementsHidden).toBe(true);
      expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    }
    expect(screen.queryByTestId('trip-card-t1-cover')).toBeNull();
  });

  test('draws the generated cover instead when the thumbnail will not draw', async () => {
    await render(<TripCoverArt trip={withPhoto()} />);

    await act(async () => {
      screen.getByTestId('trip-card-t1-photo', hidden).props.onError({ error: 'boom' });
    });

    expect(screen.queryByTestId('trip-card-t1-photo', hidden)).toBeNull();
    expect(screen.getByTestId('trip-card-t1-generated', hidden)).toBeTruthy();
    expect(screen.getByTestId('trip-card-t1-cover', hidden)).toBeTruthy();
  });

  test('keeps the failure against that thumbnail: another photograph is tried afresh', async () => {
    const view = await render(<TripCoverArt trip={withPhoto()} />);
    await act(async () => {
      screen.getByTestId('trip-card-t1-photo', hidden).props.onError({ error: 'boom' });
    });
    expect(screen.queryByTestId('trip-card-t1-photo', hidden)).toBeNull();

    await view.rerender(
      <TripCoverArt
        trip={withPhoto(
          {},
          { photoId: 'photo-2', thumbnailUri: 'file:///photos/t1/photo-2.thumb.jpg' },
        )}
      />,
    );

    expect(screen.getByTestId('trip-card-t1-photo', hidden).props.source).toEqual({
      uri: 'file:///photos/t1/photo-2.thumb.jpg',
    });
  });
});

describe('<TripCoverArt> without a photograph (FR-008)', () => {
  test('draws the generated cover: the palette, the country code and the stamp outline', async () => {
    await render(<TripCoverArt trip={cardModel()} />);

    expect(screen.queryByTestId('trip-card-t1-photo', hidden)).toBeNull();
    expect(
      screen.getByTestId('trip-card-t1-generated-glyph', hidden).props.children,
    ).toBe('PT');
    expect(screen.getByTestId('trip-card-t1-generated-stamp', hidden)).toBeTruthy();
    expect(screen.getByTestId('trip-card-t1-generated-gradient', hidden)).toBeTruthy();
  });

  test('a trip with no country falls back to the first letter of its title', async () => {
    await render(
      <TripCoverArt
        trip={cardModel({
          generated: { palette: 2, iso2: null, initial: 'Lisbon weekend' },
        })}
      />,
    );
    expect(
      screen.getByTestId('trip-card-t1-generated-glyph', hidden).props.children,
    ).toBe('L');
  });

  test('the thumb form is the code alone, with no stamp', async () => {
    await render(<TripCoverArt trip={cardModel()} thumb />);
    expect(screen.getByTestId('trip-card-t1-generated-glyph', hidden)).toBeTruthy();
    expect(screen.queryByTestId('trip-card-t1-generated-stamp', hidden)).toBeNull();
  });

  test('is decoration, and fills the frame it is put in', async () => {
    await render(<TripCoverArt trip={cardModel()} />);
    const frame = screen.getByTestId('trip-card-t1-cover', hidden);
    expect(frame.props.accessibilityElementsHidden).toBe(true);
    expect(frame.props.pointerEvents).toBe('none');
    const style = Object.assign(
      {},
      ...[frame.props.style].flat(Infinity).filter(Boolean),
    );
    expect(style).toMatchObject({
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });
});
