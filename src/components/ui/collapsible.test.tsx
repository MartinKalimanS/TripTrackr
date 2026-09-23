/**
 * Coverage for the restyled Collapsible (T027).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Collapsible } from './collapsible';

describe('<Collapsible>', () => {
  test('renders its title and hides its content until opened', async () => {
    await render(
      <Collapsible title="Details">
        <Text>hidden body</Text>
      </Collapsible>,
    );
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.queryByText('hidden body')).toBeNull();
  });

  test('reveals its content when the heading is pressed', async () => {
    await render(
      <Collapsible title="Details">
        <Text>hidden body</Text>
      </Collapsible>,
    );
    await fireEvent.press(screen.getByText('Details'));
    expect(screen.getByText('hidden body')).toBeTruthy();
  });

  /**
   * FR-017. The header is a control, and a screen reader has to be able to say
   * so. Without a role it is announced as plain text, which gives a
   * VoiceOver/TalkBack user no indication that the section can be opened at
   * all — the visual chevron is the only affordance, and it is exactly the cue
   * those users cannot see.
   */
  test('announces the heading as a button', async () => {
    await render(
      <Collapsible title="Details">
        <Text>hidden body</Text>
      </Collapsible>,
    );
    expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy();
  });

  test('announces whether the section is expanded, and updates when toggled', async () => {
    await render(
      <Collapsible title="Details">
        <Text>hidden body</Text>
      </Collapsible>,
    );

    // Collapsed is a state a screen reader must be able to report, not merely
    // the absence of content: "collapsed" tells the traveller there is more to
    // find, where silence tells them nothing.
    expect(screen.getByRole('button', { name: 'Details', expanded: false })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('button', { name: 'Details', expanded: true })).toBeTruthy();
  });
});
