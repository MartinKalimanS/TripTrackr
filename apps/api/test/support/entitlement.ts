import type { Sql } from 'postgres';

import type { RegisteredTraveller } from './app';

/**
 * Gives a fixture traveller an active entitlement, written the way the webhook will write it (as the
 * owner role: the API role can only read `subscriptions`). Suites that share one traveller across many
 * REST trip creates use it to stay clear of the free allowance, which is not what they are testing.
 */
export async function grantEntitlement(
  owner: Sql,
  traveller: RegisteredTraveller,
  periodEnd: string | null = null,
): Promise<void> {
  await owner`
    INSERT INTO subscriptions (user_id, is_active, current_period_end, provider)
    VALUES (${traveller.tokens.user.id}::uuid, true, ${periodEnd}, 'app_store')
    ON CONFLICT (user_id) DO UPDATE SET is_active = true, current_period_end = EXCLUDED.current_period_end`;
}
