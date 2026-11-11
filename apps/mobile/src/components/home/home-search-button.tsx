/**
 * Search on the Home (spec 015, T1508, FR-009 and FR-010): the round disc over the globe. It opens
 * the trips list with its search field open, which searches the traveller's trips by name on the
 * device. Drawn where the picture draws it, in the header and over the loading sky.
 *
 *   <HomeSearchButton />
 */
import { router } from 'expo-router';

import { IconButton } from '@/components/ui/icon-button';

export const HOME_SEARCH_ID = 'home-search';

export function HomeSearchButton() {
  return (
    <IconButton
      testID={HOME_SEARCH_ID}
      icon="search"
      variant="onSky"
      accessibilityLabel="Search"
      accessibilityHint="Find a trip by its name"
      onPress={() => router.navigate({ pathname: '/trips', params: { search: '1' } })}
    />
  );
}
