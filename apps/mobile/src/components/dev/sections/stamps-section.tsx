/**
 * Stamps (feature 005, T524; contract C5-25, research D5-08): the six shapes in the four inks,
 * the four baked wear masks on one shape, the ghost, and the landing (replay it with the
 * button). A stamp is decoration: it is hidden from assistive technology and its parent says
 * what it is. Every specimen is `stampSpec` of an invented country and day, plus an override
 * where a row varies one thing.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Stamp, GhostStamp } from '@/components/ui/stamp';
import { StampIn } from '@/components/ui/stamp-in';
import {
  STAMP_INKS,
  STAMP_SHAPES,
  stampSpec,
  type StampSpec,
  type StampWear,
} from '@/components/ui/stamp-spec';

import { Row, Section } from '../gallery-parts';

const SIZE = 96;
const BASE = stampSpec('PT', '2026-10-12', 'Lisbon');
const WEARS: readonly StampWear[] = [0, 1, 2, 3];

/** The base stamp with one shape and ink, and no rotation, so a row differs in one way. */
function variant(overrides: Partial<StampSpec>): StampSpec {
  return { ...BASE, rotationDeg: 0, wear: 0, ...overrides };
}

function Shapes() {
  return (
    <Row label="six shapes, four inks" testID="gallery-stamps-shapes">
      {STAMP_SHAPES.map((shape, index) => (
        <Stamp
          key={shape}
          size={SIZE}
          spec={variant({ shape, ink: STAMP_INKS[index % STAMP_INKS.length] })}
          testID={`gallery-stamp-${shape}`}
        />
      ))}
    </Row>
  );
}

function Wear() {
  return (
    <Row label="wear · 0 to 3" testID="gallery-stamps-wear">
      {WEARS.map((wear) => (
        <Stamp
          key={wear}
          size={SIZE}
          spec={variant({ shape: 'circle', ink: 'navy', wear })}
          testID={`gallery-stamp-wear-${wear}`}
        />
      ))}
    </Row>
  );
}

function Perforated() {
  return (
    <Row label="perforated ring, and tilted" testID="gallery-stamps-variants">
      <Stamp
        size={SIZE}
        spec={variant({ shape: 'rect', ink: 'teal', perforated: true })}
        testID="gallery-stamp-perforated"
      />
      <Stamp size={SIZE} spec={BASE} testID="gallery-stamp-base" />
      <GhostStamp size={SIZE} testID="gallery-stamp-ghost" />
    </Row>
  );
}

function Landing() {
  const [run, setRun] = useState(0);
  return (
    <Row label="landing · scale, turn, thud" testID="gallery-stamps-landing">
      <StampIn key={run} tiltDeg={BASE.rotationDeg} play testID="gallery-stamp-in">
        <Stamp size={SIZE} spec={BASE} testID="gallery-stamp-landing" />
      </StampIn>
      <Button
        variant="tonal"
        icon="refresh"
        accessibilityLabel="Land the stamp again"
        testID="gallery-stamp-replay"
        onPress={() => setRun((count) => count + 1)}>
        Land again
      </Button>
    </Row>
  );
}

export function StampsSection() {
  return (
    <Section
      id="stamps"
      title="Stamps"
      note="Decoration only. Multiply on the light themes, plain on the dark.">
      <Shapes />
      <Wear />
      <Perforated />
      <Landing />
    </Section>
  );
}
