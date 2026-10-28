/**
 * The rail of a stop on the timeline - tasks.md T545 (spec FR-041, FR-070; contract C5-20): the
 * 28 dp node, the solid 3 dp spine under it and the 8 dp lead above it, in a 32 dp column.
 *
 * - The node says where the stop is in the journey with three SHAPES, never colour alone: a
 *   check on the ink for a stop done, its number on the coral fill with a 4 dp halo for the one
 *   the traveller is at (the label on the coral is `accentInk`, navy, never white), its number
 *   inside a 2 dp ring for those to come. While a row is dragged it is a neutral disc of the
 *   same size.
 * - The spine runs from the node down to the next stop, solid: the ink, or the coral line under
 *   the stop the traveller is at. Under the last stop there is none.
 * - The lead is the 8 dp joint above the node: dotted where the traveller moved on from the stop
 *   before (the `TransitRow` of that journey is drawn beneath that stop), solid where the two
 *   are one stay, nothing above the first.
 *
 * Ids: `stop-rail-<id>` (the column), `stop-dot-<id>` (the node), `stop-number-<id>` and
 * `stop-check-<id>` (what is in it), `stop-rail-top-<id>` (the lead) and `stop-rail-bottom-<id>`
 * (the spine). All of it is drawn per row so the rows stay independent items of the drag list.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import type { StopNodeState } from '@/features/trips/stop-timeline';
import { cornerOf } from '@/theme';

import { DottedSpine } from './spine';

export type RailLead = 'dotted' | 'solid' | null;

/** How a stop is joined from above: nothing for the first, a dotted lead after a journey. */
export function leadOf(isFirst: boolean, from: object | null | undefined): RailLead {
  if (isFirst) return null;
  return from ? 'dotted' : 'solid';
}

const RAIL_WIDTH = 32;
const NODE = 28;
const HALO = 4;
const RING = 2;
const SPINE = 3;
const LEAD_HEIGHT = 8;
const TABULAR = { fontVariant: ['tabular-nums' as const] };
const CHECK: IconName = 'check';
const COLOR_KEYS = [
  'ink',
  'accent',
  'accentTint',
  'accentLine',
  'surface',
  'border',
] as const;

interface NodeProps {
  id: string;
  state: StopNodeState;
  position: number;
  /** A row is being carried: the same box, with nothing in it. */
  dragging?: boolean;
}

export function StopNode({ id, state, position, dragging = false }: NodeProps) {
  const colors = useColors(COLOR_KEYS);
  const base = {
    width: NODE,
    height: NODE,
    ...cornerOf('full'),
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  if (dragging) {
    return (
      <View
        testID={`stop-dot-${id}`}
        style={[base, { backgroundColor: colors.border }]}
      />
    );
  }
  if (state === 'done') {
    return (
      <View testID={`stop-dot-${id}`} style={[base, { backgroundColor: colors.ink }]}>
        <Icon name={CHECK} size={16} tone="onInk" testID={`stop-check-${id}`} />
      </View>
    );
  }
  const now = state === 'now';
  const look = now
    ? {
        backgroundColor: colors.accent,
        outlineWidth: HALO,
        outlineColor: colors.accentTint,
        outlineStyle: 'solid' as const,
      }
    : { backgroundColor: colors.surface, borderWidth: RING, borderColor: colors.ink };
  return (
    <View testID={`stop-dot-${id}`} style={[base, look]}>
      <Text
        variant="caption"
        capped
        tone={now ? 'onAccent' : 'default'}
        style={TABULAR}
        testID={`stop-number-${id}`}>
        {position}
      </Text>
    </View>
  );
}

function Lead({ id, lead }: { id: string; lead: RailLead }) {
  const colors = useColors(COLOR_KEYS);
  if (lead === null) return <View style={{ height: LEAD_HEIGHT }} />;
  return (
    <View
      testID={`stop-rail-top-${id}`}
      style={[
        { height: LEAD_HEIGHT, width: SPINE },
        lead === 'solid' ? { backgroundColor: colors.ink } : null,
      ]}>
      {lead === 'dotted' ? <DottedSpine stopId={id} slot="lead" /> : null}
    </View>
  );
}

interface RailProps {
  id: string;
  state: StopNodeState;
  lead: RailLead;
  /** A line runs down to the next stop (every stop but the last). */
  showSpine: boolean;
  dragging?: boolean;
  /** The node. */
  children: ReactNode;
}

export function StopRail({
  id,
  state,
  lead,
  showSpine,
  dragging = false,
  children,
}: RailProps) {
  const colors = useColors(COLOR_KEYS);
  return (
    <View testID={`stop-rail-${id}`} style={{ width: RAIL_WIDTH, alignItems: 'center' }}>
      <Lead id={id} lead={dragging ? null : lead} />
      {children}
      {showSpine && !dragging ? (
        <View
          testID={`stop-rail-bottom-${id}`}
          style={{
            width: SPINE,
            flex: 1,
            minHeight: LEAD_HEIGHT,
            marginTop: 2,
            ...cornerOf('sm'),
            backgroundColor: state === 'now' ? colors.accentLine : colors.ink,
          }}
        />
      ) : null}
    </View>
  );
}
