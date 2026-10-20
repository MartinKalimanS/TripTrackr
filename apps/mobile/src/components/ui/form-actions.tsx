/**
 * `FormActions` - a form's closing row (feature 004; contract C4-8; FR-005, FR-009, FR-019,
 * FR-029, FR-030): a text "Cancel" beside the one primary "Save".
 *
 *   <FormActions testIDPrefix="add-trip" saveLabel="Save trip"
 *                onCancel={close} onSave={submit} saveDisabled={!valid} />
 *
 * - The ids are `<prefix>-cancel` and `<prefix>-save` and the names are "Cancel" and the
 *   `saveLabel`, exactly as before: the Maestro flows and the screen suites select by
 *   them. Cancel stays first, so the reading order is unchanged.
 * - Emphasis (FR-005): Save is the single `primary` of the form, Cancel a `text` button
 *   (the Sunrise look of feature 005, contract C5-29: Cancel in the ink, Save the one coral).
 *   `saveDisabled` makes Save a disabled `Button`: dimmed, announced unavailable and
 *   inert, while Cancel keeps working. A slow save is the caller's `busy` concern on a
 *   screen that needs one; this row has no busy state.
 * - The row wraps (FR-029): Save `grow`s to take the line Cancel leaves (Cancel keeps to
 *   its label), and when the labels get wide enough at the largest text size the row
 *   breaks so Save sits on its own line. `max-w-full` lets a very long label wrap INSIDE
 *   a button that already fills the row instead of overflowing it.
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
const SAVE = 'grow max-w-full';

export function FormActions({
  testIDPrefix,
  saveLabel,
  onCancel,
  onSave,
  saveDisabled = false,
}: FormActionsProps) {
  return (
    <View className="mt-2 flex-row flex-wrap gap-3">
      <Button
        testID={`${testIDPrefix}-cancel`}
        variant="text"
        accessibilityLabel="Cancel"
        onPress={() => onCancel()}
        className={CANCEL}>
        Cancel
      </Button>
      <Button
        testID={`${testIDPrefix}-save`}
        variant="primary"
        accessibilityLabel={saveLabel}
        disabled={saveDisabled}
        onPress={() => onSave()}
        className={SAVE}>
        {saveLabel}
      </Button>
    </View>
  );
}
