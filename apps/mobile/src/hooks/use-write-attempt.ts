/**
 * A local write whose failure is reported and shown in words, never swallowed.
 *
 * It is also where the haptics of a write live (feature 004, FR-020), because it is the one
 * place that knows whether the write went through: `attemptSave` plays the success haptic
 * once a save has succeeded (never for a failed one: the record is not saved), and
 * `attemptRemoval` plays the warning haptic as a destructive confirmation is given. Both
 * are silent under reduced motion (`useHaptics`).
 */
import { useState } from 'react';

import { useHaptics } from '@/hooks/use-haptics';
import { Sentry } from '@/lib/sentry';

export function useWriteAttempt(failureMessage: string) {
  const [writeError, setWriteError] = useState<string | null>(null);
  const haptics = useHaptics();

  /** Runs a local write; reports and returns false when it throws. */
  const attempt = (write: () => void): boolean => {
    try {
      setWriteError(null);
      write();
      return true;
    } catch (error) {
      Sentry.captureException(error);
      setWriteError(failureMessage);
      return false;
    }
  };

  /** A save: `attempt`, then the success haptic, only once the write has gone through. */
  const attemptSave = (write: () => void): boolean => {
    const saved = attempt(write);
    if (saved) haptics.success();
    return saved;
  };

  /** A confirmed deletion: the warning haptic as it is confirmed, then `attempt`. */
  const attemptRemoval = (write: () => void): boolean => {
    haptics.warning();
    return attempt(write);
  };

  return {
    writeError,
    clearWriteError: () => setWriteError(null),
    attempt,
    attemptSave,
    attemptRemoval,
  };
}
