/**
 * T536 - `ProgressRing`, the ring of the Countries list (feature 005; contract C5-23; research
 * D5-15): a track and an arc that starts at the top and runs clockwise, drawn with the REAL
 * `react-native-svg`, with a figure in the middle. It is decoration: the words beside it say
 * "14 of 195", so the ring and its figure are hidden from assistive technology (FR-076).
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ProgressRing, ringArc } from './progress-ring';

const hidden = { includeHiddenElements: true };

describe('ringArc: the arithmetic of the arc', () => {
  test('is the share of the circle that value is of max, from the top', () => {
    const arc = ringArc({ value: 50, max: 200, size: 64, strokeWidth: 8 });
    expect(arc.radius).toBe(28);
    expect(arc.circumference).toBeCloseTo(2 * Math.PI * 28, 6);
    expect(arc.dash).toBeCloseTo(arc.circumference / 4, 6);
  });

  test('nothing is no arc, and everything is the whole circle', () => {
    expect(ringArc({ value: 0, max: 195, size: 64, strokeWidth: 8 }).dash).toBe(0);
    const full = ringArc({ value: 195, max: 195, size: 64, strokeWidth: 8 });
    expect(full.dash).toBeCloseTo(full.circumference, 6);
  });

  test('more than the maximum stops at the whole circle, less than nothing at none', () => {
    const over = ringArc({ value: 300, max: 195, size: 64, strokeWidth: 8 });
    expect(over.dash).toBeCloseTo(over.circumference, 6);
    expect(ringArc({ value: -3, max: 195, size: 64, strokeWidth: 8 }).dash).toBe(0);
  });

  test('a first country still shows: a small share is drawn at least as long as the round caps', () => {
    const one = ringArc({ value: 1, max: 195, size: 64, strokeWidth: 8 });
    expect(one.dash).toBeGreaterThanOrEqual(1);
    expect(one.dash).toBeLessThan(one.circumference / 20);
  });

  test('a maximum of zero draws nothing instead of dividing by it', () => {
    expect(ringArc({ value: 5, max: 0, size: 64, strokeWidth: 8 }).dash).toBe(0);
  });
});

describe('<ProgressRing>', () => {
  test('draws a track and an arc, round-capped, starting at the top', async () => {
    await render(<ProgressRing value={14} max={195} testID="ring" />);
    const track = screen.getByTestId('ring-track', hidden);
    const arc = screen.getByTestId('ring-arc', hidden);
    expect(track.props.r).toBe(28);
    expect(arc.props.r).toBe(28);
    // The native host holds the cap as its enum: 0 butt, 1 round, 2 square.
    expect(arc.props.strokeLinecap).toBe(1);
    // Turned a quarter anticlockwise about its centre, so the arc starts at 12 o'clock.
    expect(arc.props.matrix[1]).toBeCloseTo(-1, 6);
    expect(arc.props.matrix[2]).toBeCloseTo(1, 6);
    const { circumference, dash } = ringArc({
      value: 14,
      max: 195,
      size: 64,
      strokeWidth: 8,
    });
    expect(arc.props.strokeDasharray).toEqual([circumference, circumference]);
    expect(Number(arc.props.strokeDashoffset)).toBeCloseTo(circumference - dash, 3);
  });

  test('draws no arc for nothing, only the track', async () => {
    await render(<ProgressRing value={0} max={195} testID="ring" />);
    expect(screen.getByTestId('ring-track', hidden)).toBeTruthy();
    expect(screen.queryByTestId('ring-arc', hidden)).toBeNull();
  });

  test('is the size it is told, and holds its centre over the drawing', async () => {
    await render(
      <ProgressRing value={14} max={195} size={80} testID="ring">
        <Text>14</Text>
      </ProgressRing>,
    );
    expect(screen.getByTestId('ring', hidden).props.style).toMatchObject({
      width: 80,
      height: 80,
    });
    expect(screen.getByText('14', hidden)).toBeTruthy();
  });

  test('is decoration, hidden from assistive technology with its centre', async () => {
    await render(
      <ProgressRing value={14} max={195} testID="ring">
        <Text>14</Text>
      </ProgressRing>,
    );
    const ring = screen.getByTestId('ring', hidden);
    expect(ring.props.accessibilityElementsHidden).toBe(true);
    expect(ring.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByText('14')).toBeNull();
  });
});
