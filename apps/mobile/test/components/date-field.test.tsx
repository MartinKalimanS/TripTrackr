/**
 * T436 - `<DateField>` on the Atlas adapters (FR-005, FR-009, FR-024, FR-025, FR-026, FR-029,
 * FR-030, FR-037; contract C4-8).
 *
 * The prop API and the ids are the ones the stop editor, the add-expense sheet and the
 * document confirm form already use: `testID` on the pressable, `<testID>-picker` on the
 * iOS calendar, the field named by its label, valued with the day in words, hinted "Opens a
 * calendar". `test/components/trip-components.test.tsx` keeps its older behaviour tests
 * (iOS toggle, Android dialog, IsoDate); this suite adds what the migration promises: a
 * label-on-top field with a 3:1 boundary, tabular numerals, the platform target at large
 * text, and an error in words (an alert) under it, never colour alone.
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { DateField } from '@/components/trip/date-field';
import { fieldMinHeight } from '@/components/ui/field';
import { MinTouchTarget } from '@/constants/theme';
import { formatIsoDate } from '@/features/trips/stop-dates';

import { classesOf, hostsWhere } from '../helpers/host-nodes';
import { resetKeyboard, setWindow } from '../helpers/keyboard';
import { anyGlyph, glyphId, glyphNamesIn } from '../helpers/icons';

const HIDDEN = { includeHiddenElements: true } as const;
const flat = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

const renderField = (props: Record<string, unknown> = {}) =>
  render(
    <DateField
      testID="arrive"
      label="Arrival"
      value="2026-05-12"
      onChange={jest.fn()}
      {...props}
    />,
  );

afterEach(() => resetKeyboard());

describe('<DateField> identity (FR-030, FR-037)', () => {
  test('is a button named by its label, valued with the day in words, hinted, with its own id', async () => {
    await renderField();

    const field = screen.getByTestId('arrive');
    expect(field.props.accessibilityRole).toBe('button');
    expect(field.props.accessibilityLabel).toBe('Arrival');
    expect(field.props.accessibilityValue).toEqual({ text: formatIsoDate('2026-05-12') });
    expect(field.props.accessibilityHint).toBe('Opens a calendar');
    expect(screen.getByLabelText('Arrival')).toBe(field);
  });

  test('reads label first, then the field, then its words: label on top, the day inside', async () => {
    await renderField({ error: 'Pick a day.' });

    const day = formatIsoDate('2026-05-12');
    const order = screen
      .getAllByText(new RegExp(`^(Arrival|${day}|Pick a day\\.)$`))
      .map((node) => String(node.props.children));
    expect(order).toEqual(['Arrival', day, 'Pick a day.']);
  });

  test('the glyph is decorative and is the calendar', async () => {
    await renderField();

    // Decorative: hidden from assistive technology, and so from a default query.
    expect(screen.queryByTestId(glyphId('calendar'))).toBeNull();
    expect(glyphNamesIn()).toEqual(['calendar']);
  });

  test('is a plain press target without an id: no id on the calendar or the words either', async () => {
    await renderField({ testID: undefined, error: 'Pick a day.' });

    await fireEvent.press(screen.getByLabelText('Arrival'));
    const calendars = hostsWhere((node) => node.props.mode === 'date');
    expect(calendars).toHaveLength(1);
    expect(calendars[0]?.props.testID).toBeUndefined();
    expect(screen.getByText('Pick a day.').props.testID).toBeUndefined();
  });
});

describe('<DateField> as a field (FR-024, FR-025, FR-029)', () => {
  test('has the boundary and fill of a Field, so it is distinguishable at 3:1', async () => {
    await renderField();

    const classes = classesOf(screen.getByTestId('arrive'));
    expect(classes).toEqual(expect.arrayContaining(['bg-field', 'border']));
    expect(classes).toContain('border-field-border');
    expect(classes).not.toContain('border-danger');
  });

  test('the day is body text, at the body size', async () => {
    await renderField();

    const day = screen.getByText(formatIsoDate('2026-05-12'));
    expect(classesOf(day)).toEqual(
      expect.arrayContaining(['text-[16px]', 'leading-[24px]', 'font-body']),
    );
  });

  test('the label is the Field’s: body size, medium weight', async () => {
    await renderField();

    const label = classesOf(screen.getByText('Arrival'));
    expect(label).toContain('font-medium');
    expect(label).toContain('text-foreground');
    expect(label).toContain('text-[16px]');
  });

  test('the target is as tall as a Field and the platform floor, and grows with the text', async () => {
    setWindow({ width: 360, height: 640, fontScale: 1 });
    const { unmount } = await renderField();
    expect(flat(screen.getByTestId('arrive')).minHeight).toBe(fieldMinHeight(1));
    expect(flat(screen.getByTestId('arrive')).minHeight).toBeGreaterThanOrEqual(
      MinTouchTarget,
    );
    await unmount();

    setWindow({ width: 360, height: 640, fontScale: 2 });
    await renderField();
    expect(flat(screen.getByTestId('arrive')).minHeight).toBe(fieldMinHeight(2));
    expect(fieldMinHeight(2)).toBeGreaterThan(fieldMinHeight(1));
  });

  test('never shrinks below the floor when the text is made smaller', async () => {
    setWindow({ width: 360, height: 640, fontScale: 0.8 });
    await renderField();

    expect(flat(screen.getByTestId('arrive')).minHeight).toBe(fieldMinHeight(0.8));
    expect(fieldMinHeight(0.8)).toBe(fieldMinHeight(1));
  });

  test('a long day wraps beside the glyph at the largest text size instead of clipping', async () => {
    await renderField();

    const day = screen.getByText(formatIsoDate('2026-05-12'));
    expect(day.props.numberOfLines).toBeUndefined();
    expect(classesOf(day)).toContain('shrink');
    expect(hostsWhere((node) => node.props.numberOfLines !== undefined)).toHaveLength(0);
  });

  test('the glyph is a trailing part of the one control, not a second control', async () => {
    await renderField();

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      within(screen.getByTestId('arrive')).getByTestId(anyGlyph, HIDDEN),
    ).toBeTruthy();
  });
});

describe('<DateField> refusal in words (FR-025, FR-030)', () => {
  test('without an error there is no alert and the boundary is the field’s', async () => {
    await renderField();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('arrive-error')).toBeNull();
    expect(classesOf(screen.getByText('Arrival'))).toContain('text-foreground');
  });

  test('an error is words under the field, an alert with its own id, and more than a colour', async () => {
    await renderField({ error: 'Departure can’t be before arrival.' });

    const words = screen.getByTestId('arrive-error');
    expect(words.props.accessibilityRole).toBe('alert');
    expect(words).toHaveTextContent('Departure can’t be before arrival.');
    expect(classesOf(words)).toContain('text-danger');
    // The boundary and the label say it in colour too, as the kit's own field does.
    expect(classesOf(screen.getByTestId('arrive'))).toContain('border-danger');
    expect(classesOf(screen.getByTestId('arrive'))).not.toContain('border-field-border');
    expect(classesOf(screen.getByText('Arrival'))).toContain('text-danger');
  });

  test('an empty error is no error', async () => {
    await renderField({ error: '' });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(classesOf(screen.getByTestId('arrive'))).toContain('border-field-border');
  });
});

describe('<DateField> calendar', () => {
  test('on iOS the calendar opens inline beneath the field and a second press closes it', async () => {
    await renderField({ minimumDate: '2026-05-01' });

    expect(screen.queryByTestId('arrive-picker')).toBeNull();
    await fireEvent.press(screen.getByTestId('arrive'));
    const picker = screen.getByTestId('arrive-picker');
    expect(picker.props.display).toBe('inline');
    expect(picker.props.mode).toBe('date');
    expect(picker.props.value).toEqual(new Date(2026, 4, 12));
    expect(picker.props.minimumDate).toEqual(new Date(2026, 4, 1));

    await fireEvent.press(screen.getByTestId('arrive'));
    expect(screen.queryByTestId('arrive-picker')).toBeNull();
  });

  test('the calendar sits between the field and its words', async () => {
    await renderField({ error: 'Pick a day.' });
    await fireEvent.press(screen.getByTestId('arrive'));

    const order = hostsWhere((node) =>
      ['arrive', 'arrive-picker', 'arrive-error'].includes(String(node.props.testID)),
    ).map((node) => node.props.testID);
    expect(order).toEqual(['arrive', 'arrive-picker', 'arrive-error']);
  });

  test('the picked day is the LOCAL calendar day, never shifted by the time of day or the zone', async () => {
    const onChange = jest.fn();
    await renderField({ onChange });

    await fireEvent.press(screen.getByTestId('arrive'));
    await act(async () =>
      screen
        .getByTestId('arrive-picker')
        .props.onValueChange({}, new Date(2026, 4, 20, 0, 5)),
    );
    expect(onChange).toHaveBeenLastCalledWith('2026-05-20');

    await fireEvent.press(screen.getByTestId('arrive'));
    await act(async () =>
      screen
        .getByTestId('arrive-picker')
        .props.onValueChange({}, new Date(2026, 4, 20, 23, 55)),
    );
    expect(onChange).toHaveBeenLastCalledWith('2026-05-20');
  });

  test('on Android a press opens the system dialog at the value and with the minimum day', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const onChange = jest.fn();
      await renderField({ onChange, minimumDate: '2026-05-01' });

      await fireEvent.press(screen.getByTestId('arrive'));

      expect(DateTimePickerAndroid.open).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'date',
          value: new Date(2026, 4, 12),
          minimumDate: new Date(2026, 4, 1),
        }),
      );
      expect(screen.queryByTestId('arrive-picker')).toBeNull();
    } finally {
      os.restore();
    }
  });
});

describe('<DateField> is composed from the adapter layer only', () => {
  test('no retired primitive, no kit, no colour literal, no legacy token', () => {
    const source = (jest.requireActual('fs') as typeof import('fs')).readFileSync(
      require.resolve('@/components/trip/date-field'),
      'utf8',
    );
    expect(source).toMatch(/from '@\/components\/ui\/tappable'/);
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
