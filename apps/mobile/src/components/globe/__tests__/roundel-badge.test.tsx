/**
 * The roundel badge — the view a pin's bitmap is baked from (F1 pins).
 *
 * Measured against the prototype (`.roundel`, `.is-active`, `.is-planned`): the sizes, the
 * white ring and its lift, the status rings (6 dp and 5 dp outside the roundel's edge, 2.5 dp
 * wide, dashed amber for a planned trip, solid on Android), and the generated cover of a
 * trip with no photograph (the palette of its id, the country's code).
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { GlobeColors, GlobeLayers, GlobeStyle } from '@/constants/theme';

import { pinImageKey, type RoundelRequest } from '../pin-features';
import { RoundelBadge, statusRingStyle } from '../roundel-badge';
import { RoundelStage } from '../roundel-stage';

const size = GlobeLayers.pins.roundelSize;
const { statusRing, statusRingOutset, roundelRing, shadowPad } = GlobeLayers.pins;

function request(
  status: RoundelRequest['status'],
  cover: string | null = 'file:///a.jpg',
  iso: string | null = null,
): RoundelRequest {
  return {
    key: pinImageKey('t1', status, cover, 'light', iso),
    tripId: 't1',
    status,
    cover,
    iso,
    palette: 1,
  };
}

/** The cover is decoration, hidden from assistive technology, as `GeneratedCover` is. */
const HIDDEN = { includeHiddenElements: true };

const noop = () => undefined;
const capture = jest.fn(async () => 'file:///x.png');

function badge(r: RoundelRequest, scheme: 'light' | 'dark' = 'light') {
  return (
    <RoundelBadge
      request={r}
      scheme={scheme}
      capture={capture}
      onCaptured={noop}
      onFailed={noop}
    />
  );
}

const flat = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe('the sizes and rings of the prototype', () => {
  test('56 live, 44 planned, 40 past and cluster; a 2 dp ring; a 2.5 dp status ring', () => {
    expect(size).toEqual({ past: 40, planning: 44, active: 56 });
    expect(GlobeLayers.pins.clusterSize).toBe(40);
    expect(roundelRing).toBe(2);
    expect(statusRing).toBe(2.5);
  });

  test('the live ring is 6 dp outside the roundel, the planned ring 5 (CSS inset -8 and -7 from the padding box, less the 2 dp border)', () => {
    const live = statusRingStyle({ status: 'active' }, 'light');
    expect(live).toMatchObject({
      width: size.active + 12,
      height: size.active + 12,
      borderRadius: (size.active + 12) / 2,
      borderWidth: statusRing,
    });
    expect(statusRingStyle({ status: 'planning' }, 'light')).toMatchObject({
      width: size.planning + 10,
      borderWidth: statusRing,
    });
    expect(statusRingStyle({ status: 'past' }, 'light')).toEqual({
      width: size.past,
      height: size.past,
    });
  });

  test('the live pulse is the size of the live ring, so it grows out of it', () => {
    expect(GlobeLayers.callout.roundelPulse).toBe(
      size.active + 2 * statusRingOutset.active,
    );
    expect(GlobeLayers.callout.ringSize.roundel).toBe(size.active);
  });

  test('the planned ring is dashed, solid on Android where a dashed circle is unreliable', () => {
    expect(statusRingStyle({ status: 'planning' }, 'light', 'ios').borderStyle).toBe(
      'dashed',
    );
    expect(statusRingStyle({ status: 'planning' }, 'light', 'android').borderStyle).toBe(
      'solid',
    );
    expect(statusRingStyle({ status: 'active' }, 'light', 'ios').borderStyle).toBe(
      'solid',
    );
  });

  test.each(['light', 'dark'] as const)(
    '%s: the ring colours are the status tokens of the theme',
    (scheme) => {
      expect(statusRingStyle({ status: 'active' }, scheme).borderColor).toBe(
        GlobeColors[scheme].active,
      );
      expect(statusRingStyle({ status: 'planning' }, scheme).borderColor).toBe(
        GlobeColors[scheme].planning,
      );
    },
  );
});

describe('the roundel disc', () => {
  test.each([
    ['light', GlobeStyle.light.pin.ring],
    ['dark', GlobeStyle.dark.pin.ring],
  ] as const)(
    '%s: a %s ring of the theme round the picture, clipped to a circle',
    async (scheme, ring) => {
      const r = request('active');
      await render(badge(r, scheme));
      const disc = screen.getByTestId(`roundel-disc-${r.key}`);
      expect(flat(disc)).toMatchObject({
        width: size.active,
        height: size.active,
        borderRadius: size.active / 2,
      });
      const clip = disc.children[0] as unknown as { props: { style: unknown } };
      expect(flat(clip)).toMatchObject({
        borderWidth: roundelRing,
        borderColor: ring,
        overflow: 'hidden',
        borderRadius: size.active / 2,
      });
    },
  );

  test('lift2 is under it: more than one shadow layer, as the token has', async () => {
    const r = request('past');
    await render(badge(r));
    const { boxShadow } = flat(screen.getByTestId(`roundel-disc-${r.key}`));
    expect(Array.isArray(boxShadow) ? boxShadow.length : 0).toBe(2);
  });

  test('the bitmap keeps a transparent margin for the lift, the same on every side', async () => {
    const r = request('planning');
    await render(badge(r));
    const style = flat(screen.getByTestId(`roundel-badge-${r.key}`));
    expect(style.padding).toBe(shadowPad);
    expect(style).not.toHaveProperty('backgroundColor');
    expect(style).not.toHaveProperty('opacity');
  });
});

describe('a trip with no photograph: the generated cover', () => {
  test('is the gradient of the palette and the country code, not a picture to load', async () => {
    const r = request('past', null, 'PT');
    await render(badge(r));
    expect(screen.getByTestId(`roundel-cover-${r.key}`, HIDDEN)).toBeTruthy();
    expect(screen.getByTestId(`roundel-glyph-${r.key}`)).toHaveTextContent('PT');
    expect(screen.queryByTestId(`roundel-image-${r.key}`)).toBeNull();
  });

  test('the code is in opaque white and sized to the circle', async () => {
    const r = request('active', null, 'PT');
    await render(badge(r));
    const glyph = flat(screen.getByTestId(`roundel-glyph-${r.key}`));
    expect(glyph.fontSize).toBe(Math.round(size.active * 0.34));
    expect(glyph.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('with no country there is the gradient alone', async () => {
    const r = request('past', null, null);
    await render(badge(r));
    expect(screen.getByTestId(`roundel-cover-${r.key}`, HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId(`roundel-glyph-${r.key}`)).toBeNull();
  });

  test('it is captured as soon as it is laid out (there is no picture to wait for)', async () => {
    capture.mockClear();
    const r = request('past', null, 'PT');
    await render(badge(r));
    expect(capture).not.toHaveBeenCalled();
    screen.getByTestId(`roundel-badge-${r.key}`).props.onLayout({
      nativeEvent: { layout: { width: 90, height: 90 } },
    });
    screen.getByTestId(`roundel-badge-${r.key}`).props.onLayout({
      nativeEvent: { layout: { width: 90, height: 90 } },
    });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  test('a photograph is NOT captured on layout, only once it is displayed', async () => {
    capture.mockClear();
    const r = request('past');
    await render(badge(r));
    expect(screen.getByTestId(`roundel-badge-${r.key}`).props.onLayout).toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('the stage', () => {
  test('lays out at most a batch of badges, off screen and not hidden', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...request('past', null, 'PT'),
      key: `k${i}`,
      tripId: `t${i}`,
    }));
    await render(
      <RoundelStage
        requests={many}
        scheme="light"
        capture={capture}
        onCaptured={noop}
        onFailed={noop}
      />,
    );
    expect(screen.getAllByTestId(/^roundel-badge-/)).toHaveLength(
      GlobeLayers.pins.captureBatch,
    );
    expect(flat(screen.getByTestId('roundel-stage'))).toMatchObject({
      position: 'absolute',
      left: -2000,
    });
  });
});
