import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';

import { bootTestApp, type BootOptions, type RegisteredTraveller } from './app';

/**
 * Fixtures for the paid trip allowance (spec 014). Purchases are written the way the webhook writes
 * them, through the `billing_*` keyholes as the owner role: the API role can only read the commerce
 * tables, so a test cannot mint a credit any other way than a real purchase can.
 */
export type CoverRow = {
  readonly trip_id: string;
  readonly source: string;
  readonly credit_id: string | null;
  readonly period_id: string | null;
};

/** An app with charging switched on (`BILLING_ENFORCED=true`), as the owner will run it later. */
export function bootCharging(
  options: BootOptions & { freeTrips?: number; tier1Trips?: number } = {},
): Promise<NestExpressApplication> {
  const { freeTrips, tier1Trips, ...rest } = options;
  return bootTestApp({
    ...rest,
    env: {
      BILLING_ENFORCED: 'true',
      ...(freeTrips === undefined ? {} : { FREE_TRIP_ALLOWANCE: String(freeTrips) }),
      ...(tier1Trips === undefined ? {} : { TIER1_YEARLY_TRIPS: String(tier1Trips) }),
      ...rest.env,
    },
  });
}

/** One single-trip purchase. Returns the store transaction id. */
export async function grantCredit(
  owner: Sql,
  traveller: RegisteredTraveller,
  options: { transactionId?: string; purchasedAt?: Date } = {},
): Promise<string> {
  const transactionId = options.transactionId ?? randomUUID();
  await owner`
    SELECT billing_grant_credit(
      ${traveller.tokens.user.id}::uuid, 'app_store', ${transactionId}, 'single_trip',
      ${(options.purchasedAt ?? new Date()).toISOString()}::timestamptz)`;
  return transactionId;
}

const DAY_MS = 86_400_000;

export interface OpenPeriodOptions {
  readonly tier?: 'tier1' | 'unlimited';
  /** The year's trips; Tier 1 only. Defaults to 10. */
  readonly uses?: number;
  /** Where the year starts and ends, relative to now. Defaults to started a day ago, ends in 364 days. */
  readonly startsInDays?: number;
  readonly endsInDays?: number;
  readonly cancelAtPeriodEnd?: boolean;
  readonly originalTransactionId?: string;
  readonly transactionId?: string;
}

/** One paid subscription year. Returns the original transaction id and the renewal's transaction id. */
export async function openPeriod(
  owner: Sql,
  traveller: RegisteredTraveller,
  options: OpenPeriodOptions = {},
): Promise<{ originalTransactionId: string; transactionId: string }> {
  const tier = options.tier ?? 'tier1';
  const originalTransactionId = options.originalTransactionId ?? randomUUID();
  const transactionId = options.transactionId ?? randomUUID();
  const now = Date.now();
  const startsAt = new Date(now + (options.startsInDays ?? -1) * DAY_MS);
  const endsAt = new Date(now + (options.endsInDays ?? 364) * DAY_MS);
  const uses = tier === 'tier1' ? (options.uses ?? 10) : null;

  await owner`
    SELECT billing_open_period(
      ${traveller.tokens.user.id}::uuid, 'app_store', ${tier}, ${originalTransactionId},
      ${transactionId}, ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
      ${uses}::integer, ${options.cancelAtPeriodEnd ?? false})`;
  return { originalTransactionId, transactionId };
}

/** Every cover row of a traveller, oldest first. */
export async function readCovers(
  owner: Sql,
  traveller: RegisteredTraveller,
): Promise<CoverRow[]> {
  return owner<CoverRow[]>`
    SELECT trip_id, source, credit_id, period_id FROM trip_covers
    WHERE user_id = ${traveller.tokens.user.id}::uuid
    ORDER BY created_at, id`;
}

/** Whether the shadow table holds this traveller, and how many times they would have been stopped. */
export async function readShadow(
  owner: Sql,
  traveller: RegisteredTraveller,
): Promise<{ attempts: number } | undefined> {
  const [row] = await owner<{ attempts: number }[]>`
    SELECT attempts FROM allowance_shadow WHERE user_id = ${traveller.tokens.user.id}::uuid`;
  return row;
}
