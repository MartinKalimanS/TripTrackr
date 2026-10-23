/**
 * The route preview of the stop editor as pictured (feature 005, UI-SPEC 9.1): the trip's
 * last two stops and the new one as dots with three-letter codes under them, a SOLID line
 * between the stops already in the trip, a DASHED coral line to the new one (a ring), and
 * under it "Stop 3 - 322 km from Sintra".
 *
 * Nothing in it is invented (owner answer Q-11; `features/trips/stop-route.ts`): the codes are
 * the first letters of the city names, the position is the count of stops, and the distance is
 * the straight-line distance between the two cities' real coordinates in the device's unit
 * (`formatDistance`: km, or miles in the US and UK). With no distance to give (the previous
 * stop's place is not cached on this device) the line says only "Stop 3 - after Sintra"; for
 * the first stop of a trip there is no route and nothing is drawn.
 *
 * The drawing is decorative; the whole is ONE image-role element named by a sentence ("Route:
 * Lisboa, Sintra, then Porto as Stop 3, 270 kilometres from Sintra"), and the line of words
 * under it is read as it is. The dots are fixed size; the codes follow the text size, and a
 * stop's column is a minimum (40 dp) that widens with its code, so a code is never cut to an
 * ellipsis at large text.
 */
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { formatDistance } from '@/lib/locale';
import type { RouteNode, RoutePreview as Route } from '@/features/trips/stop-route';
import { Space, cornerOf } from '@/theme';

export type RoutePreviewProps = { route: Route };

const COLOR_KEYS = ['ink', 'subtle', 'surface', 'accentLine'] as const;
const NODE = 12;
const NEW_NODE = 16;
const RING = 2.5;
const LINE = 2;
const COLUMN = 40;

type Colors = Record<(typeof COLOR_KEYS)[number], string>;

function Dot({ node, colors }: { node: RouteNode; colors: Colors }) {
  const size = node.isNew ? NEW_NODE : NODE;
  return (
    <View
      testID={node.isNew ? 'stop-route-new' : undefined}
      style={[
        cornerOf('full'),
        {
          width: size,
          height: size,
          marginTop: node.isNew ? 0 : 2,
          backgroundColor: node.isNew ? colors.surface : colors.ink,
          ...(node.isNew ? { borderWidth: RING, borderColor: colors.accentLine } : null),
        },
      ]}
    />
  );
}

function Stop({ node, colors }: { node: RouteNode; colors: Colors }) {
  return (
    <View style={{ minWidth: COLUMN, alignItems: 'center', gap: Space[1] }}>
      <Dot node={node} colors={colors} />
      <Text variant="caption" tone={node.isNew ? 'default' : 'muted'} numberOfLines={1}>
        {node.code}
      </Text>
    </View>
  );
}

function Line({ dashed, colors }: { dashed: boolean; colors: Colors }) {
  return (
    <View
      testID={dashed ? 'stop-route-leg-new' : 'stop-route-leg'}
      style={{
        flex: 1,
        minWidth: Space[4],
        marginTop: 7,
        height: 0,
        borderTopWidth: LINE,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: dashed ? colors.accentLine : colors.subtle,
      }}
    />
  );
}

/** "Stop 3 - 322 km from Sintra", and its spoken form. */
function describe(route: Route): { text: string; spoken: string } {
  const head = `Stop ${route.position}`;
  if (route.km === null) {
    return {
      text: ` · after ${route.fromName}`,
      spoken: `${head}, after ${route.fromName}`,
    };
  }
  const distance = formatDistance(route.km);
  return {
    text: ` · ${distance.text} from ${route.fromName}`,
    spoken: `${head}, ${distance.spoken} from ${route.fromName}`,
  };
}

export function RoutePreview({ route }: RoutePreviewProps) {
  const colors = useColors(COLOR_KEYS);
  const words = describe(route);
  const names = route.nodes.map((node) => node.name);
  const last = names[names.length - 1];
  const label = `Route: ${names.slice(0, -1).join(', ')}, then ${last} as ${words.spoken}`;

  return (
    <View testID="stop-route" style={{ paddingHorizontal: Space[2], gap: Space[2] }}>
      <View
        testID="stop-route-drawing"
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', alignItems: 'flex-start', paddingTop: Space[4] }}>
        {route.nodes.map((node, index) => (
          <View
            key={`${node.code}-${index}`}
            style={{ flexDirection: 'row', flex: index === 0 ? 0 : 1 }}>
            {index > 0 ? <Line dashed={node.isNew} colors={colors} /> : null}
            <Stop node={node} colors={colors} />
          </View>
        ))}
      </View>
      <Text testID="stop-route-meta" variant="label" tone="muted">
        <Text variant="label" strong>{`Stop ${route.position}`}</Text>
        {words.text}
      </Text>
    </View>
  );
}
