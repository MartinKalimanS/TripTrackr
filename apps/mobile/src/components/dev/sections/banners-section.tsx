/**
 * Banners, toasts and the permission state (feature 005, T524; contract C5-28). The banner is
 * a slim non-blocking row (amber for offline, danger for an error: words, a glyph and an
 * underlined action, never colour alone). The toast lives in the kit's portal host above the
 * tab bar, so it is shown by pressing the buttons; it leaves after five seconds, and "Undo" is
 * a 44 dp target in `accentPress` on navy.
 */
import { View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { PermissionState } from '@/components/ui/permission-state';
import { useToast } from '@/components/ui/toast';

import { Row, Section } from '../gallery-parts';

const noop = () => undefined;

function Banners() {
  return (
    <View testID="gallery-banners-rows" className="gap-3">
      <Banner
        tone="offline"
        message="You are offline. Changes will sync when you are back."
        testID="gallery-banner-offline"
      />
      <Banner
        tone="error"
        message="Sync failed. Your changes are safe on this device."
        action={{ label: 'Retry', onPress: noop, testID: 'gallery-banner-error-retry' }}
        testID="gallery-banner-error"
      />
      <Banner
        tone="error"
        message="Sync failed again."
        action={{ label: 'Retrying', onPress: noop, busy: true }}
        testID="gallery-banner-busy"
      />
    </View>
  );
}

function Toasts() {
  const toast = useToast();
  return (
    <Row label="Toast · five seconds, one action" testID="gallery-banners-toast">
      <Button
        variant="tonal"
        accessibilityLabel="Show a toast"
        testID="gallery-toast-show"
        onPress={() => toast.show({ message: 'Stop removed' })}>
        Show a toast
      </Button>
      <Button
        variant="tonal"
        accessibilityLabel="Show a toast with Undo"
        testID="gallery-toast-undo"
        onPress={() =>
          toast.show({
            message: 'Photo moved to Lisbon',
            action: { label: 'Undo', onPress: noop },
          })
        }>
        Show a toast with Undo
      </Button>
    </Row>
  );
}

function Permissions() {
  return (
    <View testID="gallery-banners-permission" className="gap-3">
      <PermissionState
        icon="camera"
        title="Camera access is off"
        detail="Allow the camera in Settings to scan a boarding pass."
        onOpenSettings={noop}
        alternative={{ label: 'Choose a photo instead', onPress: noop }}
        testID="gallery-permission-camera"
      />
      <PermissionState
        icon="images"
        title="Photos access is off"
        detail="Allow photos in Settings to add pictures to a trip."
        onOpenSettings={noop}
        testID="gallery-permission-photos"
      />
    </View>
  );
}

export function BannersSection() {
  return (
    <Section
      id="banners"
      title="Banners, toasts, permission"
      note="Offline and error banners, the toast, and the two permission denials.">
      <Banners />
      <Toasts />
      <Permissions />
    </Section>
  );
}
