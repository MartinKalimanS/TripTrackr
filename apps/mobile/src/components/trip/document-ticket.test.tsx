/**
 * T552 - `DocumentTicket` (FR-049, FR-050; UI-SPEC 9.2; prototype `.tkt`): one document as a
 * ticket. A cream card, 24 dp round, at least 104 dp tall; a 44 dp paper disc with the kind's
 * glyph; the title in two lines at most; an 88 dp stub (day over month) behind a 2 dp dashed
 * `sand` perforation inset 24 dp, with two notches of the canvas colour on it. At a font scale
 * of 1.15 and above it stacks and the notches are gone. ONE control.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { KIND_ICON } from '@/features/documents/document-ticket';
import { Palettes } from '@/theme';

import { classesOf } from '../../../test/helpers/host-nodes';
import { glyphNamesIn } from '../../../test/helpers/icons';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { touchDown } from '../../../test/helpers/touch';
import { DocumentTicket, type DocumentTicketProps } from './document-ticket';

const hidden = { includeHiddenElements: true };
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;

function mockFontScale(fontScale: number) {
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

beforeEach(() => mockFontScale(1));
afterEach(() => jest.restoreAllMocks());

const STUB = {
  day: '22',
  month: 'Nov',
  source: 'flight',
  spoken: 'Flight date 22 Nov',
} as const;

async function renderTicket(overrides: Partial<DocumentTicketProps> = {}) {
  const onPress = jest.fn();
  await render(
    <DocumentTicket
      id="d1"
      kind="boarding_pass"
      title="Boarding pass"
      line="AC834 · 22 Nov 2026"
      stub={STUB}
      pending={false}
      spoken="Boarding pass. AC834"
      onPress={onPress}
      {...overrides}
    />,
  );
  return onPress;
}

describe('<DocumentTicket> is ONE control', () => {
  test('a button named by the label, hinted "Opens the document", with the row id', async () => {
    const onPress = await renderTicket();

    const ticket = screen.getByTestId('document-row-d1');
    expect(ticket.props.accessibilityRole).toBe('button');
    expect(ticket.props.accessibilityLabel).toBe('Boarding pass. AC834');
    expect(ticket.props.accessibilityHint).toBe('Opens the document');
    await fireEvent.press(ticket);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('draws no chevron, no share and no copy: the stub is its cue', async () => {
    await renderTicket();

    expect(screen.queryByTestId('document-row-d1-cue', hidden)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('a held press takes the pressed fill on its own surface', async () => {
    await renderTicket();
    expect(classesOf(screen.getByTestId('document-row-d1-surface'))).toContain(
      'bg-surface-secondary',
    );

    await touchDown(screen.getByTestId('document-row-d1'));
    expect(classesOf(screen.getByTestId('document-row-d1-surface'))).toContain(
      'bg-surface-tertiary',
    );
  });
});

describe('<DocumentTicket> geometry (prototype .tkt)', () => {
  test('is cream with a hairline, 24 dp round, at least 104 dp tall, clipping its notches', async () => {
    await renderTicket();

    const surface = screen.getByTestId('document-row-d1-surface');
    expect(classesOf(surface)).toEqual(
      expect.arrayContaining(['bg-surface-secondary', 'border', 'border-separator']),
    );
    expect(flat(surface)).toMatchObject({
      borderRadius: 24,
      minHeight: 104,
      flexDirection: 'row',
      overflow: 'hidden',
    });
  });

  test('the disc is 44 dp, paper with a hairline, and holds the kind’s glyph', async () => {
    await renderTicket();

    const disc = screen.getByTestId('document-row-d1-disc');
    expect(flat(disc)).toMatchObject({ width: 44, height: 44, borderRadius: 999 });
    expect(classesOf(disc)).toEqual(
      expect.arrayContaining(['bg-background', 'border', 'border-separator']),
    );
    expect(glyphNamesIn()).toEqual(['plane']);
  });

  test.each(Object.entries(KIND_ICON))('%s draws the %s glyph', async (kind, icon) => {
    await renderTicket({ kind: kind as keyof typeof KIND_ICON });
    expect(glyphNamesIn()).toEqual([icon]);
  });

  test('the title takes two lines at most, the line one; the line has tabular figures', async () => {
    await renderTicket();

    expect(screen.getByText('Boarding pass').props.numberOfLines).toBe(2);
    const line = screen.getByTestId('document-flight-d1');
    expect(line.props.numberOfLines).toBe(1);
    expect(flat(line).fontVariant).toEqual(['tabular-nums']);
  });

  test('a ticket with no line draws none', async () => {
    await renderTicket({ line: null });
    expect(screen.queryByTestId('document-flight-d1')).toBeNull();
  });

  test('the stub is 88 dp wide, centred, with the day over the month', async () => {
    await renderTicket();

    expect(flat(screen.getByTestId('document-row-d1-stub', hidden))).toMatchObject({
      width: 88,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
    });
    expect(screen.getByTestId('document-row-d1-stub-day', hidden)).toHaveTextContent(
      '22',
    );
    expect(screen.getByTestId('document-row-d1-stub-month', hidden)).toHaveTextContent(
      'Nov',
    );
  });

  test('the perforation is a 2 dp dashed sand edge inset 24 dp from the top and the bottom', async () => {
    mockThemeColors('light');
    await renderTicket();

    expect(flat(screen.getByTestId('document-row-d1-perforation', hidden))).toMatchObject(
      {
        borderLeftWidth: 2,
        borderStyle: 'dashed',
        borderColor: asCss(Palettes.light.sand),
        top: 20,
        bottom: 20,
      },
    );
  });

  test('two notches: 20 dp circles of the canvas colour with a hairline, centred on the perforation', async () => {
    await renderTicket();

    for (const side of ['top', 'bottom']) {
      const notch = screen.getByTestId(`document-row-d1-notch-${side}`, hidden);
      expect(flat(notch)).toMatchObject({
        width: 20,
        height: 20,
        borderRadius: 999,
        right: 77,
      });
      expect(Number(flat(notch)[side])).toBeLessThanOrEqual(-10);
      expect(classesOf(notch)).toEqual(
        expect.arrayContaining(['bg-background', 'border', 'border-separator']),
      );
      expect(notch.props.accessibilityElementsHidden).toBe(true);
    }
  });

  test('the notch is drawn from the canvas token in dark as well', async () => {
    mockThemeColors('dark');
    await renderTicket();
    expect(classesOf(screen.getByTestId('document-row-d1-notch-top', hidden))).toContain(
      'bg-background',
    );
  });
});

describe('<DocumentTicket> only on this device', () => {
  test('has the dashed amber edge instead of the hairline; a saved one has neither', async () => {
    await renderTicket({ pending: true });
    expect(classesOf(screen.getByTestId('document-row-d1-surface'))).toEqual(
      expect.arrayContaining(['border-dashed', 'border-amber-line']),
    );
    expect(classesOf(screen.getByTestId('document-row-d1-surface'))).not.toContain(
      'border-separator',
    );

    await renderTicket({ id: 'd2', pending: false });
    expect(classesOf(screen.getByTestId('document-row-d2-surface'))).not.toContain(
      'border-dashed',
    );
  });
});

describe('<DocumentTicket> stacked (a font scale of 1.15 and above, FR-074)', () => {
  beforeEach(() => mockFontScale(1.5));

  test('a column, the stub a row under a dashed top edge, and the notches gone', async () => {
    mockThemeColors('light');
    await renderTicket();

    expect(flat(screen.getByTestId('document-row-d1-surface')).flexDirection).toBe(
      'column',
    );
    expect(flat(screen.getByTestId('document-row-d1-stub', hidden))).toMatchObject({
      flexDirection: 'row',
    });
    expect(flat(screen.getByTestId('document-row-d1-perforation', hidden))).toMatchObject(
      {
        borderTopWidth: 2,
        borderStyle: 'dashed',
        borderColor: asCss(Palettes.light.sand),
      },
    );
    expect(screen.queryByTestId('document-row-d1-notch-top', hidden)).toBeNull();
    expect(screen.queryByTestId('document-row-d1-notch-bottom', hidden)).toBeNull();
  });

  test('the line may take two lines', async () => {
    await renderTicket();
    expect(screen.getByTestId('document-flight-d1').props.numberOfLines).toBe(2);
  });

  test('stacks at 2 as well, and not below 1.15', async () => {
    mockFontScale(2);
    await renderTicket();
    expect(flat(screen.getByTestId('document-row-d1-surface')).flexDirection).toBe(
      'column',
    );
    mockFontScale(1.14);
    await renderTicket({ id: 'd2' });
    expect(flat(screen.getByTestId('document-row-d2-surface')).flexDirection).toBe('row');
  });
});
