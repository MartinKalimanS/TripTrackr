/**
 * T559 - the not-found route (FR-064; owner decision Q-11): one state, one control, the way
 * home, a link the router gives its press to. A real router mounts it, because the guard must
 * see the `onPress` the `Link` hands its child, not a stand-in for it.
 */
import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import NotFoundScreen from '@/app/+not-found';

import {
  deadControls,
  misroutedComingSoon,
  primaryControls,
} from '../helpers/dead-controls';

jest.setTimeout(60_000);

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

describe('Not found: no control is a dead end', () => {
  it('"Back to your globe" has the press the router gave it, and is the one primary', async () => {
    await renderRouter(
      {
        index: () => <Text>home-screen</Text>,
        '+not-found': NotFoundScreen,
      },
      { initialUrl: '/this/route/does/not/exist' },
    );

    expect(await screen.findByTestId('not-found-screen')).toBeTruthy();
    expect(screen.getByLabelText('Back to your globe')).toBeTruthy();
    expect(deadControls()).toEqual([]);
    expect(misroutedComingSoon()).toEqual([]);
    expect(primaryControls()).toEqual(['"Back to your globe"']);
  });
});
