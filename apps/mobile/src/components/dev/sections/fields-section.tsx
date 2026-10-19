/**
 * Fields (feature 005, T524; contract C5-17): default, filled with helper text, focused,
 * error and disabled. A field draws its focus ring from the live focus event, so the focused
 * specimen is the real thing: tap it. The keyboard comes up with the ring and the cream-to-paper
 * fill, which is also how to check the ring against the keyboard (a device check).
 */
import { useState } from 'react';

import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';

import { Section } from '../gallery-parts';

function Plain() {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('Lisbon to Sintra');
  return (
    <>
      <Field
        label="Trip name"
        value={name}
        onChangeText={setName}
        placeholder="Where to?"
        testID="gallery-field-default"
      />
      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        description="Only you can see this."
        testID="gallery-field-filled"
      />
    </>
  );
}

function Focus() {
  const [text, setText] = useState('');
  return (
    <>
      <Text variant="caption" tone="muted">
        Tap the field below to see it focused.
      </Text>
      <Field
        label="Focused when tapped"
        value={text}
        onChangeText={setText}
        placeholder="Tap to focus"
        testID="gallery-field-focus"
      />
    </>
  );
}

function Refused() {
  const [nights, setNights] = useState('3x');
  const [currency, setCurrency] = useState('Portugal Road Trip');
  return (
    <>
      <Field
        label="Nights"
        value={nights}
        onChangeText={setNights}
        error="Enter a whole number of nights."
        isRequired
        testID="gallery-field-error"
      />
      <Field
        label="Currency"
        value={currency}
        onChangeText={setCurrency}
        editable={false}
        testID="gallery-field-disabled"
      />
    </>
  );
}

export function FieldsSection() {
  return (
    <Section
      id="fields"
      title="Fields"
      note="56 dp minimum, a 3:1 boundary, a 2.5 dp focus ring, errors in words and a glyph.">
      <Plain />
      <Focus />
      <Refused />
    </Section>
  );
}
