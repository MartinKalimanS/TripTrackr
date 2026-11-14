/**
 * The token of an emailed link (`?token=`), taken ONCE from the route and then removed from the
 * route's parameters, so the address the app keeps never holds it (spec 015 FR-017; T1511).
 *
 * The value is read when the screen mounts (`useState` initialiser) and is checked for shape;
 * `null` means absent or malformed. It lives in this screen's state only: it is never displayed,
 * logged or reported.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { readRecoveryToken } from '@/features/auth/account-recovery';

export function useLinkToken(): string | null {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const router = useRouter();
  const [token] = useState(() => readRecoveryToken(params.token));
  const hasParam = params.token !== undefined;
  useEffect(() => {
    if (hasParam) router.setParams({ token: undefined });
  }, [hasParam, router]);
  return token;
}
