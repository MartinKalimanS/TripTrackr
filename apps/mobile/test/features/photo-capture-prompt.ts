/**
 * Driving `useCapture` through the visibility question (spec 006): a capture that picked photos
 * now waits for the traveller's answer before anything is written, so a test starts the capture,
 * waits for the prompt, answers it and lets the capture finish.
 *
 * The capture is started inside an `act` that returns at once (as the one-at-a-time test always
 * did) and awaited inside the one that answers, so no two `act` scopes overlap.
 */
import { act, waitFor, type RenderHookResult } from '@testing-library/react-native';

import type { PhotoVisibility } from '@/features/photos/capture';
import type { PhotoCapture } from '@/features/photos/use-capture';

type Hook = Pick<RenderHookResult<PhotoCapture, unknown>, 'result'>;

/** How the traveller answers: a choice, or any dismissal (swipe, tap outside, Back). */
export type Answer = PhotoVisibility | 'dismiss';

/** Start a capture; its promise is in `done`. Does not wait for the prompt. */
export async function start(
  { result }: Hook,
  how: 'addFromLibrary' | 'takePhoto' | 'allowLibraryAccess' = 'addFromLibrary',
): Promise<{ done: Promise<void> }> {
  const started = { done: Promise.resolve() };
  await act(async () => {
    started.done = result.current[how]();
  });
  return started;
}

/** Wait for the question, answer it, and let the capture finish. */
export async function answer(
  { result }: Hook,
  started: { done: Promise<void> },
  how: Answer = 'private',
): Promise<void> {
  await waitFor(() => expect(result.current.prompt).not.toBeNull());
  await act(async () => {
    if (how === 'dismiss') result.current.dismissPrompt();
    else result.current.answerPrompt(how);
    await started.done;
  });
}

/** A whole capture that is expected to ask: start, answer, finish. */
export async function captureAnswering(
  hook: Hook,
  how: 'addFromLibrary' | 'takePhoto' | 'allowLibraryAccess' = 'addFromLibrary',
  choice: Answer = 'private',
): Promise<void> {
  const started = await start(hook, how);
  await answer(hook, started, choice);
}

/** A capture that finishes with no question: refused, cancelled, or nothing picked. */
export async function captureQuietly(
  { result }: Hook,
  how: 'addFromLibrary' | 'takePhoto' | 'allowLibraryAccess' = 'addFromLibrary',
): Promise<void> {
  await act(async () => {
    await result.current[how]();
  });
  expect(result.current.prompt).toBeNull();
}
