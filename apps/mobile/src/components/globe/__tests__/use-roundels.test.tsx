/**
 * `useRoundels` — the safe pipeline (F1 pins): generated covers, a failed capture falling
 * back to its dot while the others keep their roundels, bounded memory, files released.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useMemo, type ReactElement } from 'react';
import { View } from 'react-native';

import { GlobeLayers } from '@/constants/theme';
import { toGlobeTrips, type GlobeTrip } from '@/features/globe/globe-data';

import { pinCollection } from '../pin-features';
import { useRoundels, type RoundelsOptions } from '../use-roundels';

const TODAY = '2026-05-10';

function trips(ids: string[]): GlobeTrip[] {
  return toGlobeTrips(
    ids.map((id) => ({ id, title: id })),
    ids.map((id, i) => ({
      id: `s${id}`,
      trip_id: id,
      city_id: i + 1,
      arrive_date: '2025-01-01',
      depart_date: '2025-01-01',
      country_id: 1,
      lat: 10,
      lng: i,
    })),
    TODAY,
  );
}

type Probe = { covers: Record<string, string>; ids: string[] } & RoundelsOptions;

/** Shows what the hook decided, and draws its stage. */
function Harness({ ids, covers, ...options }: Probe): ReactElement {
  const pins = useMemo(() => pinCollection(trips(ids), TODAY), [ids]);
  const { split, bitmaps, stage } = useRoundels(pins, covers, options);
  return (
    <>
      {stage}
      <View
        testID="probe"
        // @ts-expect-error numbers ride along as props for the assertions
        roundels={split.roundels.features.length}
        dots={split.dots.features.length}
        bitmaps={Object.keys(bitmaps).length}
      />
    </>
  );
}

const { releaseCapture } = jest.requireMock('react-native-view-shot') as {
  releaseCapture: jest.Mock;
};
const probe = () => screen.getByTestId('probe').props as Record<string, number>;
const badges = () => screen.queryAllByTestId(/^roundel-badge-/);
const layoutAll = async () => {
  for (const node of badges()) {
    await fireEvent(node, 'layout', { nativeEvent: { layout: { width: 9, height: 9 } } });
  }
};

beforeEach(() => releaseCapture.mockClear());

describe('every pin is wanted as a roundel, a photograph or its generated cover', () => {
  test('no cover at all: a badge for each pin, and each becomes a roundel once captured', async () => {
    const capture = jest.fn(async () => `file:///${Math.random()}.png`);
    await render(<Harness ids={['a', 'b', 'c']} covers={{}} enabled capture={capture} />);
    expect(badges()).toHaveLength(3);
    expect(probe()).toMatchObject({ roundels: 0, dots: 3 });
    await layoutAll();
    await waitFor(() => expect(probe()).toMatchObject({ roundels: 3, dots: 0 }));
    expect(badges()).toHaveLength(0);
  });

  test('disabled: nothing is laid out or captured, every pin is a dot', async () => {
    const capture = jest.fn(async () => 'file:///x.png');
    await render(
      <Harness ids={['a', 'b']} covers={{}} enabled={false} capture={capture} />,
    );
    expect(badges()).toHaveLength(0);
    expect(probe()).toMatchObject({ roundels: 0, dots: 2 });
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('a capture that fails', () => {
  test('returning nothing, or throwing: that pin is a dot, the others keep their roundels', async () => {
    let calls = 0;
    const capture = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('not laid out');
      if (calls === 2) return '';
      return `file:///ok${calls}.png`;
    });
    await render(
      <Harness ids={['a', 'b', 'c', 'd']} covers={{}} enabled capture={capture} />,
    );
    await layoutAll();
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(probe().roundels).toBe(2));
    expect(probe().dots).toBe(2);
  });

  test('is not asked for again on a later render', async () => {
    const capture = jest.fn(async () => {
      throw new Error('nope');
    });
    const view = await render(
      <Harness ids={['a']} covers={{}} enabled capture={capture} />,
    );
    await layoutAll();
    await waitFor(() => expect(badges()).toHaveLength(0));
    await view.rerender(<Harness ids={['a']} covers={{}} enabled capture={capture} />);
    expect(badges()).toHaveLength(0);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe('memory is bounded and the files are released', () => {
  test('at most the limit are ever wanted, however many pins; a batch is laid out at a time', async () => {
    const ids = Array.from({ length: 90 }, (_, i) => `t${i}`);
    const capture = jest.fn(async () => `file:///${Math.random()}.png`);
    await render(<Harness ids={ids} covers={{}} enabled capture={capture} />);
    expect(badges()).toHaveLength(GlobeLayers.pins.captureBatch);
    for (let round = 0; round < 6; round += 1) await layoutAll();
    await waitFor(() => expect(probe().roundels).toBe(GlobeLayers.pins.roundelLimit));
    expect(probe().bitmaps).toBe(GlobeLayers.pins.roundelLimit);
    expect(probe().dots).toBe(30);
    expect(capture).toHaveBeenCalledTimes(GlobeLayers.pins.roundelLimit);
  });

  test('a bitmap no request names any more (the other theme) is deleted, and the state forgets it', async () => {
    const capture = jest.fn(async () => `file:///${Math.random()}.png`);
    const view = await render(
      <Harness ids={['a']} covers={{}} enabled scheme="light" capture={capture} />,
    );
    await layoutAll();
    await waitFor(() => expect(probe().roundels).toBe(1));
    await view.rerender(
      <Harness ids={['a']} covers={{}} enabled scheme="dark" capture={capture} />,
    );
    expect(probe().bitmaps).toBe(0);
    await waitFor(() => expect(releaseCapture).toHaveBeenCalledTimes(1));
    expect(badges()).toHaveLength(1);
  });

  test('every file is deleted on unmount, and a late capture is deleted too', async () => {
    let finish: (uri: string) => void = () => undefined;
    let first = true;
    const capture = jest.fn((): Promise<string> => {
      if (first) {
        first = false;
        return Promise.resolve('file:///one.png');
      }
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const view = await render(
      <Harness ids={['a', 'b']} covers={{}} enabled capture={capture} />,
    );
    await layoutAll();
    await waitFor(() => expect(probe().roundels).toBe(1));
    await view.unmount();
    expect(releaseCapture).toHaveBeenCalledWith('file:///one.png');
    await act(async () => finish('file:///late.png'));
    expect(releaseCapture).toHaveBeenCalledWith('file:///late.png');
  });
});
