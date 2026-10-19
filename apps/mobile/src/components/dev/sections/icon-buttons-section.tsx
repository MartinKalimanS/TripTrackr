/**
 * Icon buttons (feature 005, T524; contract C5-15): default, tonal, ghost, glass and onSky,
 * at rest, busy and disabled, over a plain surface AND over the white photograph. The glass
 * disc is made for the photograph (a `scrimButton` fill with an `onPhoto` glyph) and must hold
 * its 3:1 there; `onSky` is made for the globe, so it is shown on the sky scrim too.
 */
import { View } from 'react-native';

import { IconButton, ICON_BUTTON_VARIANTS } from '@/components/ui/icon-button';
import type { IconButtonVariant } from '@/components/ui/icon-button';
import { Scrim } from '@/components/ui/scrim';
import { Text } from '@/components/ui/text';

import { Frame, PhotoFixture, Row, Section, pinned } from '../gallery-parts';

const GLYPH: Record<IconButtonVariant, 'x' | 'share' | 'ellipsis' | 'plus' | 'locate'> = {
  default: 'plus',
  tonal: 'share',
  ghost: 'ellipsis',
  glass: 'x',
  onSky: 'locate',
};

/** One variant at rest, busy and disabled. */
function VariantCluster({
  variant,
  where,
}: {
  variant: IconButtonVariant;
  where: string;
}) {
  const name = `${variant} on ${where}`;
  return (
    <View className="flex-row items-center gap-2">
      <IconButton
        icon={GLYPH[variant]}
        variant={variant}
        accessibilityLabel={name}
        testID={`gallery-icon-button-${where}-${variant}`}
      />
      <IconButton
        icon={GLYPH[variant]}
        variant={variant}
        busy
        accessibilityLabel={`${name}, working`}
      />
      <IconButton
        icon={GLYPH[variant]}
        variant={variant}
        disabled
        accessibilityLabel={`${name}, unavailable`}
      />
    </View>
  );
}

function OverSurface() {
  return (
    <Row
      label="over a plain surface · rest, busy, disabled"
      testID="gallery-icon-buttons-surface">
      {ICON_BUTTON_VARIANTS.map((variant) => (
        <VariantCluster key={variant} variant={variant} where="surface" />
      ))}
    </Row>
  );
}

function OverPhoto() {
  return (
    <View className="gap-2">
      <Text variant="eyebrow" tone="muted">
        over a white photograph
      </Text>
      <PhotoFixture height={180} testID="gallery-icon-buttons-photo">
        <View className="gap-3 p-3">
          {ICON_BUTTON_VARIANTS.map((variant) => (
            <VariantCluster key={variant} variant={variant} where="photo" />
          ))}
        </View>
      </PhotoFixture>
    </View>
  );
}

function OverSky() {
  return (
    <View className="gap-2">
      <Text variant="eyebrow" tone="muted">
        onSky over the sky of the globe
      </Text>
      <Frame height={96} testID="gallery-icon-buttons-sky">
        <Scrim kind="sky" />
        <View style={pinned.topEnd}>
          <IconButton
            icon="locate"
            variant="onSky"
            accessibilityLabel="Centre the globe"
            testID="gallery-icon-button-sky"
          />
        </View>
      </Frame>
    </View>
  );
}

export function IconButtonsSection() {
  return (
    <Section
      id="icon-buttons"
      title="Icon buttons"
      note="44 dp discs. Glass sits on a photograph, onSky on the globe.">
      <OverSurface />
      <OverPhoto />
      <OverSky />
    </Section>
  );
}
