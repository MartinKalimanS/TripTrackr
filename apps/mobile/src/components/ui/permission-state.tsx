/**
 * `PermissionState` - the camera and photographs denial screens (feature 005; contract
 * C5-28; research D5-14; FR-065): an icon, words, "Open Settings" and, where there is one, a
 * way round it. It restyles what the document camera and the photo gallery each drew by
 * hand, so a refusal looks the same wherever it appears.
 *
 *   <PermissionState
 *     icon="camera"
 *     title="Photos access is off"
 *     detail="Turn it on in Settings to add photos from your library."
 *     onOpenSettings={openSettings}
 *     alternative={{ label: 'Choose files instead', onPress: chooseFiles }} />
 *
 * - One flat surface (the same as every state: `bg-surface rounded-2xl p-6 items-center`):
 *   the icon (decorative, 24 dp) in a 72 dp cream roundel, the title (`callout`, centred), the
 *   detail (`body`, muted) and the buttons.
 * - "Open Settings" is a SECONDARY `Button` (the screen has its own primary, and a refusal is
 *   not the traveller's next step), named by `settingsLabel`. A screen whose only way forward
 *   is the one this state offers (the document camera: no shutter until the camera is allowed)
 *   says `primary`, so the state still shows exactly ONE primary (FR-005). It calls
 *   `onOpenSettings`, which is the screen's (`Linking.openSettings`), so the adapter reaches
 *   no platform API. `alternative` is a quiet text `Button` after it, so a refusal is never a
 *   dead end ("Choose files instead").
 * - `testID` and `accessibilityLiveRegion` land on the surface, as on every state;
 *   `<testID>-icon` is the roundel, `detailTestID` the words and `settingsTestID` the
 *   settings button.
 *
 * Colours are semantic classes, never a literal.
 */
import { View, type ViewProps } from 'react-native';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Detail, StateBox, type StateAction } from './state-view';
import { Text } from './text';

/** The name of the settings button unless the screen chooses another. */
const OPEN_SETTINGS = 'Open Settings';

export type PermissionStateProps = Pick<
  ViewProps,
  'testID' | 'accessibilityLiveRegion'
> & {
  /** A decorative glyph in the roundel: the camera, the photographs. */
  icon: IconName;
  /** What is off: "Photos access is off". */
  title: string;
  /** What to do about it. */
  detail?: string;
  /** Opens the app's page in Settings. */
  onOpenSettings: () => void;
  /** Default "Open Settings" (the name the parity guard has always known). */
  settingsLabel?: string;
  settingsTestID?: string;
  /** An id on the words under the title. */
  detailTestID?: string;
  /** Open Settings is the screen's one primary: only where the screen has no other. */
  primary?: boolean;
  /** A way round the refusal, as a text button. */
  alternative?: StateAction;
};

export function PermissionState({
  icon,
  title,
  detail,
  onOpenSettings,
  settingsLabel,
  settingsTestID,
  detailTestID,
  primary = false,
  alternative,
  ...surface
}: PermissionStateProps) {
  return (
    <StateBox {...surface}>
      <View
        testID={surface.testID ? `${surface.testID}-icon` : undefined}
        className="mb-1 size-[72px] items-center justify-center rounded-full border border-separator bg-surface-secondary">
        <Icon name={icon} size={24} tone="muted" />
      </View>
      <Text variant="callout" className="text-center">
        {title}
      </Text>
      <Detail testID={detailTestID}>{detail}</Detail>
      <Button
        variant={primary ? 'primary' : 'secondary'}
        accessibilityLabel={settingsLabel ?? OPEN_SETTINGS}
        testID={settingsTestID}
        onPress={() => onOpenSettings()}
        className="mt-2">
        {settingsLabel ?? OPEN_SETTINGS}
      </Button>
      {alternative ? (
        <Button
          variant="text"
          accessibilityLabel={alternative.accessibilityLabel ?? alternative.label}
          testID={alternative.testID}
          busy={alternative.busy}
          onPress={() => alternative.onPress()}>
          {alternative.label}
        </Button>
      ) : null}
    </StateBox>
  );
}
