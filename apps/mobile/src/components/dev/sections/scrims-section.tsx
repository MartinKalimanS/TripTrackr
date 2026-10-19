/**
 * Scrims (feature 005, T524; contract C5-10, C5-19): top, bottom, caption, sky, cover and the
 * fade, over the white photograph, which is the worst ground there is. White text must hold
 * 4.5:1 (7:1 in the contrast themes) wherever it sits on a scrim; on the sky the text is ink.
 * Each frame carries the text it is meant for, so a failing scrim is read at a glance.
 */
import { View } from 'react-native';

import { Scrim } from '@/components/ui/scrim';
import { Text } from '@/components/ui/text';

import { Labelled, PhotoFixture, Row, Section, pinned } from '../gallery-parts';

const HEIGHT = 168;
/** The caption block's own padding, as the trip cards give it. */
const captionPadding = { paddingHorizontal: 16, paddingBottom: 16, gap: 4 } as const;
/** Two frames side by side where there is room, one under the other where there is not. */
const halfWidth = { flexGrow: 1, flexBasis: 140 } as const;

function TopScrim() {
  return (
    <Labelled label="top · the status-bar zone, over a photograph">
      <PhotoFixture height={HEIGHT} testID="gallery-scrim-top-frame">
        <Scrim kind="top" />
        <View
          style={pinned.top}
          className="flex-row items-center justify-between px-4 pt-3">
          <Text variant="label" strong tone="onPhoto">
            9:41
          </Text>
          <Text variant="label" strong tone="onPhoto">
            100%
          </Text>
        </View>
      </PhotoFixture>
    </Labelled>
  );
}

function BottomScrim() {
  return (
    <Labelled label="bottom · a hero's foot">
      <PhotoFixture height={HEIGHT} testID="gallery-scrim-bottom-frame">
        <Scrim kind="bottom" />
        <View style={pinned.bottom} className="gap-1 p-4">
          <Text variant="eyebrow" tone="onPhoto">
            Portugal · 3 stops
          </Text>
          <Text variant="title" tone="onPhoto">
            Portugal Road Trip
          </Text>
        </View>
      </PhotoFixture>
    </Labelled>
  );
}

function CaptionScrim() {
  return (
    <Labelled label="caption · a block that wraps its text and grows with it">
      <PhotoFixture height={HEIGHT} testID="gallery-scrim-caption-frame">
        <Scrim kind="caption" style={pinned.bottom} contentStyle={captionPadding}>
          <Text variant="eyebrow" tone="onPhoto">
            12 – 19 Oct 2026
          </Text>
          <Text variant="headline" tone="onPhoto">
            A caption long enough to need a second line at large text sizes
          </Text>
        </Scrim>
      </PhotoFixture>
    </Labelled>
  );
}

function SkyAndCover() {
  return (
    <Row label="sky (ink, never white) and cover" testID="gallery-scrims-sky-cover">
      <PhotoFixture height={HEIGHT} testID="gallery-scrim-sky-frame" style={halfWidth}>
        <Scrim kind="sky" />
        <View className="gap-1 p-4">
          <Text variant="label" tone="muted">
            Good morning
          </Text>
          <Text variant="headline">Marti</Text>
        </View>
      </PhotoFixture>
      <PhotoFixture height={HEIGHT} testID="gallery-scrim-cover-frame" style={halfWidth}>
        <Scrim kind="cover" palette={0} />
      </PhotoFixture>
    </Row>
  );
}

function FadeScrims() {
  return (
    <Row
      label="fade · to the canvas and to the sheet's paper"
      testID="gallery-scrims-fade">
      <PhotoFixture height={96} testID="gallery-scrim-fade-canvas" style={halfWidth}>
        <Scrim kind="fade" ground="canvas" style={pinned.bottom} />
      </PhotoFixture>
      <PhotoFixture height={96} testID="gallery-scrim-fade-surface" style={halfWidth}>
        <Scrim kind="fade" ground="surface" style={pinned.bottom} />
      </PhotoFixture>
    </Row>
  );
}

export function ScrimsSection() {
  return (
    <Section
      id="scrims"
      title="Scrims"
      note="Over pure white. Read every line of text: it must stay legible.">
      <TopScrim />
      <BottomScrim />
      <CaptionScrim />
      <SkyAndCover />
      <FadeScrims />
    </Section>
  );
}
