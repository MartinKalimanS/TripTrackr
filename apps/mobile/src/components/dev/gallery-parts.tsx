/**
 * The furniture of the dev gallery (feature 005, T524; research D5-18): a titled section, a
 * labelled row of specimens, a bounded frame for what is positioned absolutely (the sheet,
 * the tab bars), and the white-photograph fixture.
 *
 * The white photograph is a plain view in the `onPhoto` token, which is white in all four
 * themes: it is the worst ground a scrim, a glass icon button or a caption can sit on (the
 * contrast gate measures against the same white), and it needs no asset and no network.
 *
 * None of this is a Card: a card never contains a card, and a section holds cards.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { cornerOf } from '@/theme';

import type { SectionId } from './gallery-model';

export interface SectionProps {
  id: SectionId;
  title: string;
  /** One line under the title: what to look for. */
  note?: string;
  children?: ReactNode;
}

export function Section({ id, title, note, children }: SectionProps) {
  return (
    <View testID={`gallery-${id}`} className="gap-4 border-t border-separator pt-6">
      <View className="gap-1">
        <Text variant="headline">{title}</Text>
        {note ? (
          <Text variant="caption" tone="muted">
            {note}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export interface RowProps {
  label: string;
  children?: ReactNode;
  testID?: string;
}

/** A caption over a wrapping row of specimens. */
export function Row({ label, children, testID }: RowProps) {
  return (
    <View testID={testID} className="gap-2">
      <Text variant="eyebrow" tone="muted">
        {label}
      </Text>
      <View className="flex-row flex-wrap items-center gap-3">{children}</View>
    </View>
  );
}

export interface LabelledProps {
  label: string;
  children?: ReactNode;
}

/** A caption over one specimen (a frame, a card) that is not a wrapping row. */
export function Labelled({ label, children }: LabelledProps) {
  return (
    <View className="gap-2">
      <Text variant="eyebrow" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

export interface FrameProps {
  /** The frame's height in dp: a bounded box, so an absolute child has something to sit in. */
  height: number;
  testID: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A bounded, clipped, hairline-edged box on the canvas. */
export function Frame({ height, testID, children, style }: FrameProps) {
  return (
    <View
      testID={testID}
      className="overflow-hidden border border-separator bg-background"
      style={[cornerOf('lg'), { height }, style]}>
      {children}
    </View>
  );
}

/** The white photograph: the ground the scrims and the glass controls are measured on. */
export function PhotoFixture({ height, testID, children, style }: FrameProps) {
  return (
    <View
      testID={testID}
      className="overflow-hidden border border-separator bg-on-photo"
      style={[cornerOf('lg'), { height }, style]}>
      {children}
    </View>
  );
}

/** Pins its children to a corner of a frame. */
export const pinned = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  topEnd: { position: 'absolute', top: 12, right: 12 },
  fill: StyleSheet.absoluteFill,
});
