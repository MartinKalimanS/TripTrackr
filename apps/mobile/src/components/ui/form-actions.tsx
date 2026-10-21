/**
 * `FormActions` and `FormCancel` - a form sheet's two actions (feature 004; contract C4-8;
 * FR-005, FR-009, FR-019, FR-029, FR-030), split by where the Sunrise pictures put them
 * (feature 005, F6; UI-SPEC 3.6: "Cancel (ink, left), title (centred), a sticky primary
 * above the keyboard"):
 *
 *   <FormCancel testIDPrefix="add-trip" onCancel={close} />                 the header's left
 *   <FormActions testIDPrefix="add-trip" saveLabel="Save trip"
 *                onCancel={close} onSave={submit} saveDisabled={!valid} />   the footer
 *
 * - The ids are `<prefix>-cancel` and `<prefix>-save` and the names are "Cancel" and the
 *   `saveLabel`, exactly as before: the Maestro flows and the screen suites select by
 *   them. `FormSheet` puts Cancel in the header, so the reading order is now Cancel, the
 *   title, the fields, Save.
 * - Emphasis (FR-005): Save is the single `primary` of the form, a full-width 56 dp pill;
 *   Cancel is a `text` button (contract C5-29: Cancel in the ink, Save the one coral).
 *   `saveDisabled` makes Save a disabled `Button`: dimmed, announced unavailable and
 *   inert, while Cancel keeps working. A slow save is the caller's `busy` concern on a
 *   screen that needs one; this row has no busy state.
 * - `FormActions` still accepts `onCancel` so a caller hands ONE `actions` object to
 *   `FormSheet`; the footer itself draws only Save. The label may wrap inside the button
 *   at the largest text size (FR-029): `max-w-full` lets a long label wrap INSIDE a button
 *   that already fills the row instead of overflowing it.
 * - Press feedback, the target floor, the focus ring and the Save haptic are `Button`'s.
 */
import { View } from 'react-native';

import { Button } from './button';

export type FormActionsProps = {
  testIDPrefix: string;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
};

const CANCEL = 'max-w-full';
const SAVE = 'self-stretch max-w-full';

/** The header's Cancel: a text button in the ink, named "Cancel". */
export function FormCancel({
  testIDPrefix,
  onCancel,
}: Pick<FormActionsProps, 'testIDPrefix' | 'onCancel'>) {
  return (
    <Button
      testID={`${testIDPrefix}-cancel`}
      variant="text"
      size="sm"
      accessibilityLabel="Cancel"
      onPress={() => onCancel()}
      className={CANCEL}>
      Cancel
    </Button>
  );
}

/** The footer: the one primary, Save, full width. */
export function FormActions({
  testIDPrefix,
  saveLabel,
  onSave,
  saveDisabled = false,
}: FormActionsProps) {
  return (
    <View>
      <Button
        testID={`${testIDPrefix}-save`}
        variant="primary"
        size="lg"
        accessibilityLabel={saveLabel}
        disabled={saveDisabled}
        onPress={() => onSave()}
        className={SAVE}>
        {saveLabel}
      </Button>
    </View>
  );
}
