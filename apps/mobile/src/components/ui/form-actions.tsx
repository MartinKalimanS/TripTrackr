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
 * - Two optional names for the rare form whose buttons do not read "Cancel" and "Save"
 *   (spec 006, the photo visibility sheet: leaving it still adds the photos, so "Cancel" would
 *   mislead, and its button adds): `cancelLabel` is the header button's text and name, and
 *   `saveTestID` its footer id where `<prefix>-save` is not what a flow selects by. Both
 *   default to what every other form has had all along.
 */
import { View } from 'react-native';

import { Button } from './button';

export type FormActionsProps = {
  testIDPrefix: string;
  saveLabel: string;
  /** The footer button's id when it is not `<prefix>-save`. */
  saveTestID?: string;
  /** The header button's text and name when it is not "Cancel". */
  cancelLabel?: string;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  /** `destructive` for an action that cannot be undone (Delete account); default `primary`. */
  saveVariant?: 'primary' | 'destructive';
  /** The request is in flight: announced busy and ignored if pressed again. */
  saveBusy?: boolean;
};

const CANCEL = 'max-w-full';
const SAVE = 'self-stretch max-w-full';

/** The header's Cancel: a text button in the ink, named "Cancel". */
export function FormCancel({
  testIDPrefix,
  cancelLabel,
  onCancel,
}: Pick<FormActionsProps, 'testIDPrefix' | 'cancelLabel' | 'onCancel'>) {
  const shared = {
    testID: `${testIDPrefix}-cancel`,
    variant: 'text',
    size: 'sm',
    onPress: () => onCancel(),
    className: CANCEL,
  } as const;
  // The default keeps its name as a literal so the parity guard (testid-baseline) reads it.
  return cancelLabel === undefined ? (
    <Button {...shared} accessibilityLabel="Cancel">
      Cancel
    </Button>
  ) : (
    <Button {...shared} accessibilityLabel={cancelLabel}>
      {cancelLabel}
    </Button>
  );
}

/** The footer: the one primary, Save, full width (or one destructive action, never both). */
export function FormActions({
  testIDPrefix,
  saveLabel,
  saveTestID,
  onSave,
  saveDisabled = false,
  saveVariant = 'primary',
  saveBusy = false,
}: FormActionsProps) {
  return (
    <View>
      <Button
        testID={saveTestID ?? `${testIDPrefix}-save`}
        variant={saveVariant}
        size="lg"
        accessibilityLabel={saveLabel}
        disabled={saveDisabled}
        busy={saveBusy}
        onPress={() => onSave()}
        className={SAVE}>
        {saveLabel}
      </Button>
    </View>
  );
}
