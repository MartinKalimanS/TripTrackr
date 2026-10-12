/**
 * `PrivacyChip` - "Only you" with a lock (feature 005, T520; contract C5-16; FR-055, FR-065,
 * FR-070): the label of what only the traveller can see (expenses, documents, a private
 * note). A lock icon on `aquaTint` in `aquaInk`, announced "Only you can see this", id
 * `privacy-chip`.
 *
 *   <PrivacyChip />
 *
 * It is a label (`SoftLabel`): not pressable, one announced `text` element, the lock
 * decorative beside the words. It shows a fact the app already enforces (Constitution I);
 * it stores and sends nothing, and it is never the only carrier of that fact.
 */
import { Icon } from './icon';
import { PRIVACY_LOOK } from './chip-look';
import { SoftLabel } from './soft-label';

export interface PrivacyChipProps {
  /** The one label of the contract. */
  label?: 'Only you';
}

export function PrivacyChip({ label = 'Only you' }: PrivacyChipProps) {
  return (
    <SoftLabel
      look={PRIVACY_LOOK}
      label={label}
      accessibilityLabel={`${label} can see this`}
      testID="privacy-chip"
      leading={<Icon testID="privacy-chip-icon" name="lock" size={16} tone="aquaInk" />}
    />
  );
}
