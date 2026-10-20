/**
 * Containers and rows (feature 005, T524; contract C5-18): the three cards (lift, tile, flat),
 * a card over the globe (opaque, never translucent), a card that is waiting to sync, a
 * pressable card, a group of rows, the stat tiles and the area pills.
 *
 * A card never contains a card (a development error), so nothing here nests one.
 */
import { View } from 'react-native';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { AreaPill } from '@/components/ui/area-pill';
import { Avatar } from '@/components/ui/avatar';
import { Card, type CardVariant } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import { PrivacyChip } from '@/components/ui/privacy-chip';
import { Scrim } from '@/components/ui/scrim';
import { StatTile } from '@/components/ui/stat-tile';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
import { useAppearance } from '@/hooks/use-appearance';
import { isLargeText, areaColumns } from '@/components/ui/reflow';

import { Frame, Row, Section } from '../gallery-parts';

const VARIANTS: readonly CardVariant[] = ['lift', 'tile', 'flat'];

function CardBody({ title }: { title: string }) {
  return (
    <View className="gap-1">
      <Text variant="callout">{title}</Text>
      <Text variant="label" tone="muted">
        Lisbon to Sintra, 8 days
      </Text>
    </View>
  );
}

function Variants() {
  return (
    <View testID="gallery-cards-variants" className="gap-3">
      {VARIANTS.map((variant) => (
        <Card key={variant} variant={variant} testID={`gallery-card-${variant}`}>
          <CardBody title={`Card · ${variant}`} />
        </Card>
      ))}
      <Card pending testID="gallery-card-pending">
        <View className="flex-row items-center justify-between gap-2">
          <CardBody title="Card · pending" />
          <SyncBadge state="pending" />
        </View>
      </Card>
      <Card
        onPress={() => undefined}
        accessibilityLabel="Card · pressable, opens the trip"
        testID="gallery-card-pressable">
        <CardBody title="Card · pressable" />
      </Card>
    </View>
  );
}

function OverMap() {
  return (
    <View className="gap-2">
      <Text variant="eyebrow" tone="muted">
        overMap · opaque, hairline, second lift, over the sky
      </Text>
      <Frame height={150} testID="gallery-cards-overmap">
        <Scrim kind="sky" />
        <View className="flex-1 justify-center p-4">
          <Card overMap testID="gallery-card-overmap">
            <CardBody title="Card · over the map" />
          </Card>
        </View>
      </Frame>
    </View>
  );
}

function Rows() {
  return (
    <View testID="gallery-cards-rows">
      <ListGroup header="Settings" testID="gallery-list-group">
        <ListRow title="Home currency" description="Euro" onPress={() => undefined} />
        <ListRow
          title="Account"
          description="ana@example.com"
          leading={<Avatar name="Ana Silva" size="sm" decorative />}
          onPress={() => undefined}
        />
        <ListRow
          title="Privacy"
          leading={<Icon name="shield-check" size={20} tone="muted" />}
          trailing={<PrivacyChip />}
        />
        <ListRow title="Storage" description="Not pressable, no chevron" />
        <ListRow title="Unavailable" disabled onPress={() => undefined} />
        <ListRow title="Working" busy onPress={() => undefined} />
        <ListRow title="Sign out" tone="destructive" onPress={() => undefined} />
      </ListGroup>
    </View>
  );
}

function Tiles() {
  return (
    <Row label="StatTile · static, pressable, counting" testID="gallery-cards-stats">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <StatTile value={14} of={195} label="Countries" icon="globe" />
        </View>
        <View className="flex-1">
          <StatTile
            value="9,380"
            unit="km"
            label="Distance"
            icon="route"
            onPress={() => undefined}
          />
        </View>
      </View>
      <View className="flex-1">
        <StatTile
          value={<AnimatedNumber value={128} variant="numeral" />}
          label="Photos"
          icon="images"
          accessibilityLabel="128 photos"
        />
      </View>
    </Row>
  );
}

/** The four areas of a trip, as the areas strip lays them out: a cell each, 4 or 2 across. */
const AREAS = [
  { icon: 'images', label: 'Photos', count: 128 },
  { icon: 'note', label: 'Notes', count: 9 },
  { icon: 'wallet', label: 'Expenses', count: '842 EUR', private: true },
  { icon: 'file-text', label: 'Documents', count: 3, private: true, warn: true },
] as const;

function Areas() {
  const { fontScale } = useAppearance();
  const columns = areaColumns(fontScale);
  const cell = columns === 4 ? '25%' : '50%';
  return (
    <View testID="gallery-cards-areas" className="gap-2">
      <Text variant="eyebrow" tone="muted">
        {`AreaPill · ${columns} across${isLargeText(fontScale) ? ' (large text)' : ''}`}
      </Text>
      <View className="-m-1 flex-row flex-wrap">
        {AREAS.map((area) => (
          <View key={area.label} style={{ width: cell, padding: 4 }}>
            <AreaPill {...area} onPress={() => undefined} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function CardsSection() {
  return (
    <Section
      id="cards"
      title="Cards, rows, tiles"
      note="Lift, tile, flat; over the map; pending; the group of rows; stats; the four areas.">
      <Variants />
      <OverMap />
      <Rows />
      <Tiles />
      <Areas />
    </Section>
  );
}
