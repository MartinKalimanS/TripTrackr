/**
 * T436 - `<AnchorPicker>` on the Atlas `ChipGroup` (FR-005, FR-019, FR-024, FR-025, FR-026,
 * FR-029, FR-030, FR-037; contract C4-8).
 *
 * The prop API and the ids are the ones the note editor already uses: `testID` on the
 * container (`note-editor-anchor`), `anchor-<key>` on each chip named by the target's
 * label, a `radiogroup` whose chips are `radio`s announced `{ selected, checked }`. What
 * the migration adds: the chips are the kit's (filled accent, heavier label and a check
 * glyph while selected: not colour alone), a refusal is words with an alert icon, and the
 * empty trip says what to do next.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { AnchorPicker } from '@/components/trip/anchor-picker';
import type { AnchorTarget } from '@/features/notes/use-move-note';

import { classesOf, hostsWhere, scrollers } from '../helpers/host-nodes';
import { anyGlyph } from '../helpers/icons';

const HIDDEN = { includeHiddenElements: true } as const;

const targets: AnchorTarget[] = [
  {
    level: 'trip',
    key: 'country:1',
    label: 'Whole trip (Italy)',
    country_id: 1,
    city_id: null,
  },
  { level: 'city', key: 'city:100', label: 'Roma, Italy', country_id: 1, city_id: 100 },
  {
    level: 'city',
    key: 'city:101',
    label: 'Firenze, Italy',
    country_id: 1,
    city_id: 101,
  },
];

const renderPicker = (props: Record<string, unknown> = {}) =>
  render(
    <AnchorPicker
      testID="note-editor-anchor"
      label="Filed under"
      targets={targets}
      value="city:100"
      onChange={jest.fn()}
      {...props}
    />,
  );

describe('<AnchorPicker> identity (FR-030, FR-037)', () => {
  test('keeps the container id, the visible label and one radio group', async () => {
    await renderPicker();

    expect(screen.getByTestId('note-editor-anchor')).toBeTruthy();
    expect(screen.getByText('Filed under')).toBeTruthy();
    const groups = hostsWhere((node) => node.props.accessibilityRole === 'radiogroup');
    expect(groups).toHaveLength(1);
    // The group is left unnamed, as before: its name would be a label the testID guard
    // (scripts/testid-baseline.mjs) cannot read, and the label is read just before it.
    expect(groups[0]?.props.accessibilityLabel).toBeUndefined();
  });

  test('each target is a radio with its own id, named by its label, in the order given', async () => {
    await renderPicker();

    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.props.testID)).toEqual([
      'anchor-country:1',
      'anchor-city:100',
      'anchor-city:101',
    ]);
    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual([
      'Whole trip (Italy)',
      'Roma, Italy',
      'Firenze, Italy',
    ]);
  });

  test('selection is the state "selected and checked", on the one chip whose key is the value', async () => {
    await renderPicker({ value: 'city:101' });

    const states = screen
      .getAllByRole('radio')
      .map((radio) => radio.props.accessibilityState);
    expect(states).toEqual([
      expect.objectContaining({ selected: false, checked: false }),
      expect.objectContaining({ selected: false, checked: false }),
      expect.objectContaining({ selected: true, checked: true }),
    ]);
  });

  test('with no choice yet nothing is selected', async () => {
    await renderPicker({ value: '' });

    expect(
      screen
        .getAllByRole('radio')
        .filter((radio) => radio.props.accessibilityState.selected === true),
    ).toHaveLength(0);
  });

  test('pressing a chip reports its key, and so does pressing the selected one again', async () => {
    const onChange = jest.fn();
    await renderPicker({ onChange });

    await fireEvent.press(screen.getByTestId('anchor-city:101'));
    expect(onChange).toHaveBeenLastCalledWith('city:101');
    await fireEvent.press(screen.getByTestId('anchor-city:100'));
    expect(onChange).toHaveBeenLastCalledWith('city:100');
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('<AnchorPicker> as chips (FR-019, FR-024, FR-025, FR-026, FR-029)', () => {
  test('selection is more than a colour: a check glyph and a heavier label on the selected chip', async () => {
    await renderPicker();

    const selected = screen.getByTestId('anchor-city:100');
    expect(within(selected).getByTestId('anchor-city:100-check', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('anchor-city:101-check', HIDDEN)).toBeNull();
    expect(classesOf(within(selected).getByText('Roma, Italy'))).toContain(
      'font-semibold',
    );
    expect(
      classesOf(
        within(screen.getByTestId('anchor-city:101')).getByText('Firenze, Italy'),
      ),
    ).not.toContain('font-semibold');
  });

  test('chips wrap onto further lines, so every target is in view and none is hidden off a sideways row', async () => {
    await renderPicker();

    expect(scrollers()).toHaveLength(0);
    expect(hostsWhere((node) => node.props.horizontal === true)).toHaveLength(0);
  });

  test('every chip keeps the platform target floor', async () => {
    await renderPicker();

    for (const radio of screen.getAllByRole('radio')) {
      const style = [radio.props.style].flat(Infinity).filter(Boolean);
      expect(style.some((entry) => (entry as { minHeight?: number }).minHeight)).toBe(
        true,
      );
    }
  });
});

describe('<AnchorPicker> words (FR-025, FR-035)', () => {
  test('no error draws nothing extra', async () => {
    await renderPicker();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('note-editor-anchor-error')).toBeNull();
  });

  test('an error is words with an alert icon, an alert, under the chips, with an id', async () => {
    await renderPicker({ error: 'Choose where this note belongs.' });

    const words = screen.getByTestId('note-editor-anchor-error');
    expect(words.props.accessibilityRole).toBe('alert');
    expect(words).toHaveTextContent('Choose where this note belongs.');
    expect(within(words).getByTestId(anyGlyph, HIDDEN)).toBeTruthy();
    const order = hostsWhere(
      (node) =>
        node.props.testID === 'anchor-city:101' ||
        node.props.testID === 'note-editor-anchor-error',
    ).map((node) => node.props.testID);
    expect(order).toEqual(['anchor-city:101', 'note-editor-anchor-error']);
  });

  test('an error with no container id still has an id of its own', async () => {
    await renderPicker({ testID: undefined, error: 'Choose one.' });

    expect(screen.getByTestId('anchor-picker-error')).toHaveTextContent('Choose one.');
  });

  test('a trip with no stops says what to do, in words, and offers no chips', async () => {
    await renderPicker({ targets: [], value: '' });

    expect(
      screen.getByText(
        'Add a stop to this trip first — notes are filed under its countries and cities.',
      ),
    ).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(
      hostsWhere((node) => node.props.accessibilityRole === 'radiogroup'),
    ).toHaveLength(0);
  });
});

describe('<AnchorPicker> is composed from the adapter layer only', () => {
  test('no retired primitive, no kit, no colour literal, no legacy token', () => {
    const source = (jest.requireActual('fs') as typeof import('fs')).readFileSync(
      require.resolve('@/components/trip/anchor-picker'),
      'utf8',
    );
    expect(source).toMatch(/from '@\/components\/ui\/chip'/);
    expect(source).toMatch(/from '@\/components\/ui\/text'/);
    expect(source).not.toMatch(
      /ThemedText|ThemedView|\bSurface\b|PressableSurface|PillGroup|TextField/,
    );
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(
      /@\/constants\/theme|use-appearance|Colors\[|#[0-9a-fA-F]{3,8}\b|rgba?\(/,
    );
  });
});
