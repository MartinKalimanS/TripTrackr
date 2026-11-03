/**
 * A server-issued nonce kept ready for the Google sheet (spec 012; FR-005). Google needs the
 * nonce BEFORE its request is built, so it is fetched on mount; `renew` fetches the next one after
 * an attempt has used or failed with this one (a nonce is never offered twice). `nonce` is null
 * while one is on its way, and a failed fetch is handed to `onError` and leaves it null.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchOAuthNonce } from '@/features/auth/oauth-nonce';

export interface OAuthNonceHandle {
  readonly nonce: string | null;
  readonly renew: () => void;
}

/** A nonce and the request (generation) it was fetched for, so a stale one is never offered. */
interface Issued {
  readonly generation: number;
  readonly nonce: string;
}

export function useOAuthNonce(onError: (error: unknown) => void): OAuthNonceHandle {
  const [issued, setIssued] = useState<Issued | null>(null);
  const [generation, setGeneration] = useState(0);
  const report = useRef(onError);

  useEffect(() => {
    report.current = onError;
  }, [onError]);

  useEffect(() => {
    let active = true;
    fetchOAuthNonce()
      .then((nonce) => {
        if (active) setIssued({ generation, nonce });
      })
      .catch((error: unknown) => {
        if (active) report.current(error);
      });
    return () => {
      active = false;
    };
  }, [generation]);

  const renew = useCallback(() => setGeneration((value) => value + 1), []);
  return { nonce: issued?.generation === generation ? issued.nonce : null, renew };
}
