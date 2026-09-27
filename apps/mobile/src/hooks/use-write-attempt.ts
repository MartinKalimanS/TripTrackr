/** A local write whose failure is reported and shown in words, never swallowed. */
import { useState } from 'react';

import { Sentry } from '@/lib/sentry';

export function useWriteAttempt(failureMessage: string) {
  const [writeError, setWriteError] = useState<string | null>(null);

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

  return { writeError, clearWriteError: () => setWriteError(null), attempt };
}
