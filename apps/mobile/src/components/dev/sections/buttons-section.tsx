/**
 * Buttons (feature 005, T524; contract C5-15): every variant in every state (rest, held,
 * busy, disabled), the three sizes, and the icon-only form.
 *
 * "Held" is a fixture (`HeldButton`) drawn from the button's own look table, since a press is
 * a state of a live `Pressable`; press and hold any button here to compare it with the real
 * thing.
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { BUTTON_VARIANTS, type ButtonVariant } from '@/components/ui/button-look';
import { Text } from '@/components/ui/text';

import { HeldButton } from '../held-button';
import { Row, Section } from '../gallery-parts';

const LABELS: Record<ButtonVariant, string> = {
  primary: 'Save trip',
  secondary: 'Add stop',
  tonal: 'Edit',
  text: 'Cancel',
  destructive: 'Delete',
};

function VariantRow({ variant }: { variant: ButtonVariant }) {
  const label = LABELS[variant];
  const icon = variant === 'destructive' ? 'trash' : undefined;
  return (
    <Row
      label={`${variant} · rest, held, busy, disabled`}
      testID={`gallery-buttons-${variant}`}>
      <Button variant={variant} icon={icon} accessibilityLabel={label}>
        {label}
      </Button>
      <HeldButton variant={variant}>{label}</HeldButton>
      <Button variant={variant} icon={icon} busy accessibilityLabel={`${label}, working`}>
        {label}
      </Button>
      <Button variant={variant} icon={icon} disabled accessibilityLabel={label}>
        {label}
      </Button>
    </Row>
  );
}

function SizeRow() {
  return (
    <Row label="sizes · sm 44, md 52, lg 56 (minimums: they grow with the text)">
      <Button size="sm" accessibilityLabel="Small">
        Small
      </Button>
      <Button size="md" accessibilityLabel="Medium">
        Medium
      </Button>
      <Button size="lg" accessibilityLabel="Large">
        Large
      </Button>
      <Button variant="tonal" size="md" icon="plus" accessibilityLabel="Add a stop">
        Add a stop
      </Button>
    </Row>
  );
}

function IconOnlyRow() {
  return (
    <Row label="icon only">
      <Button iconOnly icon="plus" accessibilityLabel="Add" />
      <Button iconOnly icon="search" variant="tonal" accessibilityLabel="Search" />
      <Button iconOnly icon="share" variant="secondary" accessibilityLabel="Share" />
      <Button iconOnly icon="trash" variant="destructive" accessibilityLabel="Remove" />
    </Row>
  );
}

export function ButtonsSection() {
  return (
    <Section
      id="buttons"
      title="Buttons"
      note="Rest, held, busy, disabled. One primary per screen, and ink on every pressed fill.">
      {BUTTON_VARIANTS.map((variant) => (
        <VariantRow key={variant} variant={variant} />
      ))}
      <SizeRow />
      <IconOnlyRow />
      <View>
        <Text variant="caption" tone="muted">
          The wide row below is a long label at scale 2: it wraps and the button grows.
        </Text>
      </View>
      <Button variant="secondary" accessibilityLabel="A label long enough to wrap">
        A label that is long enough to wrap onto a second line at large text
      </Button>
    </Section>
  );
}
