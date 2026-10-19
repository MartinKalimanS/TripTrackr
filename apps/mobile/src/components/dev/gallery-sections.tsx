/**
 * The sections of the dev gallery, in reading order (feature 005, T524): one entry per id of
 * `SECTION_IDS`, so adding an adapter to the gallery is one file and one line here.
 */
import type { ComponentType } from 'react';

import type { SectionId } from './gallery-model';
import { BannersSection } from './sections/banners-section';
import { ButtonsSection } from './sections/buttons-section';
import { CardsSection } from './sections/cards-section';
import { ChipsSection } from './sections/chips-section';
import { CoversSection } from './sections/covers-section';
import { EmptyStatesSection } from './sections/empty-states-section';
import { FieldsSection } from './sections/fields-section';
import { IconButtonsSection } from './sections/icon-buttons-section';
import { NavigationSection } from './sections/navigation-section';
import { ScrimsSection } from './sections/scrims-section';
import { SheetSection } from './sections/sheet-section';
import { SkeletonsSection } from './sections/skeletons-section';
import { StampsSection } from './sections/stamps-section';
import { TripsSection } from './sections/trips-section';
import { TypeSection } from './sections/type-section';

export const GALLERY_SECTIONS: Record<SectionId, ComponentType> = {
  type: TypeSection,
  buttons: ButtonsSection,
  'icon-buttons': IconButtonsSection,
  chips: ChipsSection,
  cards: CardsSection,
  trips: TripsSection,
  fields: FieldsSection,
  skeletons: SkeletonsSection,
  'empty-states': EmptyStatesSection,
  banners: BannersSection,
  scrims: ScrimsSection,
  stamps: StampsSection,
  covers: CoversSection,
  sheet: SheetSection,
  navigation: NavigationSection,
};
