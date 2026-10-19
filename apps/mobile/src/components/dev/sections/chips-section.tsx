/**
 * Chips, pills, status and sync (feature 005, T524; contract C5-16): every state of `Chip`, the
 * group and the segmented pill, the three trip statuses, every sync chip state, the record
 * badges (also glyph-only on the white photograph), the flags and the privacy chip.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Chip, ChipGroup, StatusChip } from '@/components/ui/chip';
import { FlagChip } from '@/components/ui/flag-chip';
import { PrivacyChip } from '@/components/ui/privacy-chip';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { SyncBadge } from '@/components/ui/sync-badge';
import { SyncChip } from '@/components/ui/sync-chip';
import { ToneChip } from '@/components/ui/tone-chip';
import type { SyncChipState } from '@/features/sync/use-sync-chip-state';

import { PhotoFixture, Row, Section } from '../gallery-parts';

const CURRENCIES = [
  {
    key: 'EUR',
    label: 'EUR',
    testID: 'gallery-currency-EUR',
    accessibilityLabel: 'Euro',
  },
  {
    key: 'USD',
    label: 'USD',
    testID: 'gallery-currency-USD',
    accessibilityLabel: 'US dollar',
  },
  {
    key: 'GBP',
    label: 'GBP',
    testID: 'gallery-currency-GBP',
    accessibilityLabel: 'Pound',
  },
  { key: 'JPY', label: 'JPY', testID: 'gallery-currency-JPY', accessibilityLabel: 'Yen' },
  {
    key: 'BRL',
    label: 'BRL',
    testID: 'gallery-currency-BRL',
    accessibilityLabel: 'Real',
  },
] as const;

const FILTERS = [
  {
    key: 'all',
    label: 'All',
    count: 12,
    testID: 'gallery-filter-all',
    accessibilityLabel: 'All, 12',
  },
  {
    key: 'active',
    label: 'Active',
    count: 1,
    testID: 'gallery-filter-active',
    accessibilityLabel: 'Active, 1',
  },
  {
    key: 'past',
    label: 'Past',
    count: 9,
    testID: 'gallery-filter-past',
    accessibilityLabel: 'Past, 9',
  },
] as const;

const SYNC_STATES: readonly SyncChipState[] = [
  { kind: 'waiting', count: 3 },
  { kind: 'syncing', count: 3 },
  { kind: 'offline', count: 3 },
  { kind: 'offline', count: 0 },
  { kind: 'failed', count: 3 },
];

function ChipStates() {
  return (
    <Row
      label="Chip · rest, selected, leading icon, dashed, disabled"
      testID="gallery-chips-chip">
      <Chip label="Rest" accessibilityLabel="Rest" onPress={() => undefined} />
      <Chip
        label="Selected"
        selected
        accessibilityLabel="Selected"
        onPress={() => undefined}
      />
      <Chip
        label="Lisbon"
        leading="map-pin"
        accessibilityLabel="Lisbon"
        onPress={() => undefined}
      />
      <Chip
        label="Add"
        leading="plus"
        dashed
        accessibilityLabel="Add"
        onPress={() => undefined}
      />
      <Chip
        label="Disabled"
        disabled
        accessibilityLabel="Disabled"
        onPress={() => undefined}
      />
      <Chip label="Not pressable" accessibilityLabel="Not pressable" />
    </Row>
  );
}

function Groups() {
  const [currency, setCurrency] = useState<string>('EUR');
  const [filter, setFilter] = useState<string>('all');
  return (
    <>
      <View testID="gallery-chips-group" className="gap-2">
        <ChipGroup
          options={CURRENCIES}
          selectedKey={currency}
          onSelect={setCurrency}
          scroll
          accessibilityLabel="Currency"
        />
      </View>
      <View testID="gallery-chips-segmented" className="gap-2">
        <SegmentedPill
          options={FILTERS}
          selectedKey={filter}
          onSelect={setFilter}
          accessibilityLabel="Trips filter"
        />
        <SegmentedPill
          size="sm"
          role="radiogroup"
          options={FILTERS}
          selectedKey={filter}
          onSelect={setFilter}
          accessibilityLabel="Trips filter, small"
        />
      </View>
    </>
  );
}

function Statuses() {
  return (
    <Row label="StatusChip" testID="gallery-chips-status">
      <StatusChip status="planning" />
      <StatusChip status="active" />
      <StatusChip status="active" dayOf={{ day: 3, of: 8 }} />
      <StatusChip status="past" />
    </Row>
  );
}

function SyncStates() {
  return (
    <Row
      label="SyncChip · waiting, syncing, offline, offline empty, failed"
      testID="gallery-chips-sync">
      {SYNC_STATES.map((state) => (
        <SyncChip
          key={`${state.kind}-${'count' in state ? state.count : 0}`}
          state={state}
          onRetry={() => undefined}
        />
      ))}
    </Row>
  );
}

function Badges() {
  return (
    <>
      <Row label="SyncBadge · pending, syncing, failed" testID="gallery-chips-badge">
        <SyncBadge state="pending" />
        <SyncBadge state="syncing" />
        <SyncBadge state="failed" />
      </Row>
      <Row label="SyncBadge glyph-only, on a white photograph">
        <PhotoFixture height={56} testID="gallery-chips-badge-photo">
          <View className="flex-row items-center gap-3 p-4">
            <SyncBadge state="pending" glyphOnly />
            <SyncBadge state="syncing" glyphOnly />
            <SyncBadge state="failed" glyphOnly />
          </View>
        </PhotoFixture>
      </Row>
    </>
  );
}

function Marks() {
  return (
    <>
      <Row
        label="FlagChip · md and lg, and the two-letter fallback"
        testID="gallery-chips-flag">
        <FlagChip iso2="PT" />
        <FlagChip iso2="JP" />
        <FlagChip iso2="BR" size="lg" />
        <FlagChip iso2="GB" size="lg" />
        <FlagChip iso2="ZZ" />
      </Row>
      <Row label="PrivacyChip and ToneChip" testID="gallery-chips-privacy">
        <PrivacyChip />
        <ToneChip label="Saved" icon="check-circle" tone="success" />
        <ToneChip label="Needs attention" icon="alert" tone="danger" />
        <ToneChip label="12 MB" icon="download" />
      </Row>
    </>
  );
}

export function ChipsSection() {
  return (
    <Section
      id="chips"
      title="Chips and status"
      note="State is never colour alone: each has a glyph or words.">
      <ChipStates />
      <Groups />
      <Statuses />
      <SyncStates />
      <Badges />
      <Marks />
    </Section>
  );
}
