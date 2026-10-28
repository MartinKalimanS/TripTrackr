/**
 * `DocumentTicket` - one document in the trip's list, drawn as a ticket (feature 005, T552;
 * FR-049, FR-050; UI-SPEC 9.2; prototype `.tkt`, `.tmain`, `.tic`, `.tsub`, `.nt`; picture
 * `more/documents`).
 *
 *   <DocumentTicket id="d1" kind="boarding_pass" title="Boarding pass" line="AC834 · 22 Nov 2026"
 *     stub={{ day: '22', month: 'Nov', ... }} spoken="..." onPress={open} />
 *
 * The card is cream (`surfaceSecondary`) with a hairline, 24 dp round, at least 104 dp tall. Left
 * to right: a 44 dp paper disc with the kind's icon, the text (the title in two lines at most,
 * one muted line, then what the data says about the state), and an 88 dp STUB with the day
 * over the month behind a 2 dp dashed `sand` perforation that is inset 24 dp from the top and
 * the bottom. Two notches sit on the perforation: circles of the CANVAS colour with a hairline,
 * 20 dp, half of each clipped by the card (no mask), so the card looks torn. A document that is
 * only on this device has the dashed amber edge instead of the hairline (a shape, never the
 * only signal: the badge and the words say it).
 *
 * From a font scale of 1.15 (`isLargeText`) it STACKS, as the trips' ticket does: the text,
 * then the stub as a row under a dashed top edge, the notches gone, nothing a fixed height.
 *
 * ONE control (`Tappable`, role button) named by `spoken`, hinted "Opens the
 * document", id `document-row-<id>`; the surface inside is `<id>-surface`. The disc, the stub
 * and the notches are decoration. It offers nothing to share, export or copy (FR-032).
 */
import type { DocumentType } from '@triptrackr/contracts';
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useLiftStyle } from '@/components/ui/lift';
import { isLargeText } from '@/components/ui/reflow';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { BorderHairline } from '@/constants/theme';
import { KIND_ICON, type TicketStub } from '@/features/documents/document-ticket';
import { useFontScale } from '@/hooks/use-font-scale';
import { Space, cornerOf } from '@/theme';

export interface DocumentTicketProps {
  id: string;
  kind: DocumentType;
  title: string;
  /** One muted line under the title (the flight), or none. */
  line: string | null;
  stub: TicketStub;
  /** Recorded on this device only: the dashed amber edge. */
  pending: boolean;
  /** What a screen reader says for the whole ticket: its accessible name. */
  spoken: string;
  /** The state, in words and badges, under the line. */
  children?: ReactNode;
  onPress: () => void;
}

export const TICKET_MIN_HEIGHT = 104;
export const TICKET_STUB_WIDTH = 88;
export const TICKET_NOTCH = 20;
const DISC = 44;
const PERFORATION = 2;
const COLOR_KEYS = ['sand'] as const;

/** A notch: a circle of the canvas colour, centred on the perforation, half clipped. */
function Notch({ id, side }: { id: string; side: 'top' | 'bottom' }) {
  const offset = -(TICKET_NOTCH / 2) - BorderHairline;
  const style: ViewStyle = {
    position: 'absolute',
    right: TICKET_STUB_WIDTH - TICKET_NOTCH / 2 - PERFORATION / 2,
    width: TICKET_NOTCH,
    height: TICKET_NOTCH,
    ...cornerOf('full'),
    ...(side === 'top' ? { top: offset } : { bottom: offset }),
  };
  return (
    <View
      testID={`document-row-${id}-notch-${side}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      className="border border-separator bg-background"
      style={style}
    />
  );
}

function Stub({ id, stub, stacked }: { id: string; stub: TicketStub; stacked: boolean }) {
  const { sand } = useColors(COLOR_KEYS);
  const perforation: ViewStyle = stacked
    ? {
        position: 'absolute',
        top: 0,
        left: Space[5],
        right: Space[5],
        borderTopWidth: PERFORATION,
        borderStyle: 'dashed',
        borderColor: sand,
      }
    : {
        position: 'absolute',
        left: 0,
        top: Space[5],
        bottom: Space[5],
        borderLeftWidth: PERFORATION,
        borderStyle: 'dashed',
        borderColor: sand,
      };
  return (
    <View
      testID={`document-row-${id}-stub`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: Space[2],
        gap: stacked ? Space[2] : 0,
        flexDirection: stacked ? 'row' : 'column',
        width: stacked ? undefined : TICKET_STUB_WIDTH,
      }}>
      <View
        testID={`document-row-${id}-perforation`}
        pointerEvents="none"
        style={perforation}
      />
      <Text
        variant="headline"
        testID={`document-row-${id}-stub-day`}
        style={{ fontVariant: ['proportional-nums'] }}>
        {stub.day}
      </Text>
      <Text variant="caption" tone="muted" testID={`document-row-${id}-stub-month`}>
        {stub.month}
      </Text>
    </View>
  );
}

export function DocumentTicket({
  id,
  kind,
  title,
  line,
  stub,
  pending,
  spoken,
  children,
  onPress,
}: DocumentTicketProps) {
  const lift = useLiftStyle(null);
  const fontScale = useFontScale();
  const stacked = isLargeText(fontScale);

  return (
    <Tappable
      testID={`document-row-${id}`}
      accessibilityLabel={spoken}
      accessibilityHint="Opens the document"
      onPress={onPress}
      style={[cornerOf('xl'), lift, { backgroundColor: 'transparent' }]}>
      {({ pressed }) => (
        <View
          testID={`document-row-${id}-surface`}
          className={`${
            pending ? 'border border-dashed border-amber-line' : 'border border-separator'
          } ${pressed ? 'bg-surface-tertiary' : 'bg-surface-secondary'}`}
          style={[
            cornerOf('xl'),
            {
              flexDirection: stacked ? 'column' : 'row',
              alignItems: 'stretch',
              minHeight: TICKET_MIN_HEIGHT,
              overflow: 'hidden',
            },
          ]}>
          <View
            className="flex-1 flex-row items-center"
            style={{ gap: Space[3], padding: Space[4] }}>
            <View
              testID={`document-row-${id}-disc`}
              className="items-center justify-center border border-separator bg-background"
              style={{ width: DISC, height: DISC, ...cornerOf('full') }}>
              <Icon testID={`document-row-${id}-icon`} name={KIND_ICON[kind]} size={20} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text variant="callout" numberOfLines={2} accessibilityRole="text">
                {title}
              </Text>
              {line ? (
                <Text
                  variant="label"
                  tone="muted"
                  numberOfLines={stacked ? 2 : 1}
                  testID={`document-flight-${id}`}
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {line}
                </Text>
              ) : null}
              {children}
            </View>
          </View>
          <Stub id={id} stub={stub} stacked={stacked} />
          {stacked ? null : (
            <>
              <Notch id={id} side="top" />
              <Notch id={id} side="bottom" />
            </>
          )}
        </View>
      )}
    </Tappable>
  );
}
