/**
 * `ActionAlert` - the notice that asks for a decision. Pinned: the words are one `alert`, the
 * icon is drawn with them, the main action is a button named by its label, the dismissal is
 * optional and both run what the caller gave.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { glyphsIn } from '../../../test/helpers/icons';

import { ActionAlert } from './action-alert';

const base = {
  tone: 'warning' as const,
  title: 'Billing problem',
  message: 'Your plan did not renew. Your trips stay as they are.',
  testID: 'alert',
};

test('says its title and message as one alert, with an icon', async () => {
  await render(
    <ActionAlert {...base} action={{ label: 'Fix payment', onPress: jest.fn() }} />,
  );

  const words = screen.getByTestId('alert-message');
  expect(words.props.accessibilityRole).toBe('alert');
  expect(screen.getByText('Billing problem')).toBeTruthy();
  expect(screen.getByText(base.message)).toBeTruthy();
  expect(glyphsIn()).toHaveLength(1);
});

test('the action and the dismissal run what the caller gave', async () => {
  const onAction = jest.fn();
  const onDismiss = jest.fn();
  await render(
    <ActionAlert
      {...base}
      action={{ label: 'Fix payment', onPress: onAction }}
      dismiss={{ label: 'Later', onPress: onDismiss }}
    />,
  );

  await fireEvent.press(screen.getByTestId('alert-action'));
  await fireEvent.press(screen.getByTestId('alert-dismiss'));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('has no dismissal button unless asked for one', async () => {
  await render(
    <ActionAlert {...base} action={{ label: 'Fix payment', onPress: jest.fn() }} />,
  );
  expect(screen.queryByTestId('alert-dismiss')).toBeNull();
  expect(screen.getByLabelText('Fix payment')).toBeTruthy();
});
