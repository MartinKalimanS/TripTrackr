/**
 * The type specimen (feature 005, T524; contract C5-7; research D5-06): the ten roles of the
 * Sunrise scale, which between them use all six bundled faces, and the numerals row, where the
 * figures of Bricolage must line up (tabular) however the digits differ.
 */
import { View } from 'react-native';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { Text } from '@/components/ui/text';
import { TypeRoleNames, TypeRoles, type TypeRole } from '@/theme';

import { Row, Section } from '../gallery-parts';

/** What each role is shown saying. */
const SAMPLES: Record<TypeRole, string> = {
  display: 'Good morning',
  numeral: '14 of 195',
  title: 'Portugal Road Trip',
  headline: 'Where you have been',
  callout: 'Lisbon to Sintra',
  body: 'Two nights by the coast, then the train to Porto.',
  label: 'Planning · 8 days',
  caption: '128 photos',
  eyebrow: 'Portugal · 3 stops',
  accent: 'Marti',
};

/** The face a role is set in, as the contract names them. */
const FACES = {
  display: 'Bricolage Grotesque',
  body: 'DM Sans',
  serif: 'Instrument Serif Italic',
} as const;

function describe(role: TypeRole): string {
  const token = TypeRoles[role];
  const size = token.size === null ? 'inherits' : `${token.size}/${token.lineHeight}`;
  return `${role} · ${FACES[token.family]} ${token.weight} · ${size}`;
}

function RoleRow({ role }: { role: TypeRole }) {
  return (
    <View testID={`gallery-type-${role}`} className="gap-1">
      <Text variant="caption" tone="muted">
        {describe(role)}
      </Text>
      {role === 'accent' ? (
        <Text variant="title">
          Good morning, <Text variant="accent">{SAMPLES.accent}</Text>
        </Text>
      ) : (
        <Text variant={role}>{SAMPLES[role]}</Text>
      )}
    </View>
  );
}

/** Rows of figures whose widths must agree: a column of 1s over a column of 8s. */
const NUMERAL_ROWS = [11111, 88888, 12345, 67890] as const;

function NumeralsRow() {
  return (
    <View testID="gallery-numerals" className="gap-3">
      <Row label="Numerals · tabular, right-aligned: the columns must line up">
        <View className="items-end gap-1">
          {NUMERAL_ROWS.map((value) => (
            <AnimatedNumber
              key={value}
              value={value}
              testID={`gallery-numeral-${value}`}
              format={{ useGrouping: false }}
            />
          ))}
        </View>
        <View className="gap-1">
          <AnimatedNumber
            value={1234567}
            variant="title"
            testID="gallery-numeral-grouped"
          />
          <AnimatedNumber
            value={842.5}
            variant="headline"
            format={{ minimumFractionDigits: 2 }}
            testID="gallery-numeral-money"
          />
        </View>
      </Row>
    </View>
  );
}

export function TypeSection() {
  return (
    <Section
      id="type"
      title="Type"
      note="Six faces over ten roles. At scale 2, no line may clip.">
      {TypeRoleNames.map((role) => (
        <RoleRow key={role} role={role} />
      ))}
      <NumeralsRow />
    </Section>
  );
}
