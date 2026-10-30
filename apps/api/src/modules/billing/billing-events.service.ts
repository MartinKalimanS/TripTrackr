import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Sql } from 'postgres';

import { loadEnv } from '@/common/config/env.schema';
import { PG_CONNECTION } from '@/common/db/db.module';

import type { RevenueCatEvent } from './revenuecat-event';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDERS: Readonly<Record<string, string>> = {
  APP_STORE: 'app_store',
  MAC_APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
};
const SUBSCRIPTION_STARTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
]);

/**
 * Applies provider events to the paid allowance through the `billing_*` keyholes (spec 014, D14-08).
 * Every keyhole is idempotent on the store's transaction id, so a replayed or reordered delivery
 * changes nothing the second time. An event this does not understand is acknowledged and dropped:
 * answering an error would only make the provider retry it for days.
 *
 * Logs carry the event type only: never a traveller, a transaction or a product.
 *
 * Visibility posture: no traveller-facing surface. Runs on the API role's pool with no traveller
 * identity; the keyholes bound what it can touch.
 */
@Injectable()
export class BillingEventsService {
  private readonly logger = new Logger(BillingEventsService.name);

  constructor(@Inject(PG_CONNECTION) private readonly sql: Sql) {}

  async apply(event: RevenueCatEvent): Promise<void> {
    const handled = await this.route(event);
    if (!handled) this.logger.log(`Billing event not acted on: ${event.type}`);
  }

  private async route(event: RevenueCatEvent): Promise<boolean> {
    const provider = PROVIDERS[event.store ?? ''];
    const product = event.product_id ? loadEnv().BILLING_PRODUCTS[event.product_id] : undefined;
    if (!UUID.test(event.app_user_id) || !provider || !product) return false;

    const refund =
      event.type === 'REFUND' ||
      (event.type === 'CANCELLATION' &&
        (event.cancel_reason === 'CUSTOMER_SUPPORT' || product.kind === 'credit'));
    if (refund) return this.refund(event);

    if (product.kind === 'credit') {
      return event.type === 'NON_RENEWING_PURCHASE' && this.grantCredit(event, provider);
    }
    if (SUBSCRIPTION_STARTS.has(event.type)) {
      return this.openPeriod(event, provider, product.kind, false);
    }
    if (event.type === 'CANCELLATION') {
      return this.openPeriod(event, provider, product.kind, true);
    }
    if (event.type === 'EXPIRATION') return this.endPeriod(event);
    return false;
  }

  private async grantCredit(event: RevenueCatEvent, provider: string): Promise<boolean> {
    if (!event.transaction_id || event.purchased_at_ms === undefined) return false;
    await this.sql`
      SELECT billing_grant_credit(
        ${event.app_user_id}::uuid, ${provider}, ${event.transaction_id},
        ${event.product_id ?? ''}, ${new Date(event.purchased_at_ms).toISOString()}::timestamptz)`;
    return true;
  }

  private async openPeriod(
    event: RevenueCatEvent,
    provider: string,
    tier: 'tier1' | 'unlimited',
    cancelAtEnd: boolean,
  ): Promise<boolean> {
    const { transaction_id: txn, original_transaction_id: original } = event;
    if (!txn || !original || event.purchased_at_ms === undefined || !event.expiration_at_ms) {
      return false;
    }
    const uses = tier === 'tier1' ? loadEnv().TIER1_YEARLY_TRIPS : null;
    await this.sql`
      SELECT billing_open_period(
        ${event.app_user_id}::uuid, ${provider}, ${tier}, ${original}, ${txn},
        ${new Date(event.purchased_at_ms).toISOString()}::timestamptz,
        ${new Date(event.expiration_at_ms).toISOString()}::timestamptz,
        ${uses}::integer, ${cancelAtEnd})`;
    return true;
  }

  private async endPeriod(event: RevenueCatEvent): Promise<boolean> {
    if (!event.original_transaction_id) return false;
    const at = new Date(event.expiration_at_ms ?? Date.now()).toISOString();
    await this.sql`SELECT billing_end_period(${event.original_transaction_id}, ${at}::timestamptz)`;
    return true;
  }

  private async refund(event: RevenueCatEvent): Promise<boolean> {
    if (!event.transaction_id) return false;
    await this.sql`SELECT billing_refund(${event.transaction_id}, now())`;
    return true;
  }
}
