import { z } from 'zod';

import {
  CityId,
  CountryId,
  CurrencyCode,
  DecimalString,
  IsoDate,
  IsoDateTime,
  RateString,
  Uuid,
} from '../scalars';

/**
 * Per-table record shapes for the sync protocol.
 *
 * Every table is expressed as three layers:
 *
 *   - `*Fields`      — what the traveller's device authors. Client-owned columns only.
 *   - `*PushRecord`  — fields + identity + `updated_at` + a `deleted` flag. **Strict**:
 *                      an unknown key is a refusal, not an ignore. This is how a
 *                      visibility flag smuggled onto an expense or a document is
 *                      rejected by the wire format itself (FR-027, FR-032).
 *   - `*PullRecord`  — fields + identity + timestamps + tombstone + the columns the
 *                      server owns (derived status, upload/moderation state, frozen FX).
 *
 * Columns the server derives or assigns — `trips.status`, `trips.owner_id`,
 * `expense_categories.user_id`, storage keys, wrapped keys — are deliberately
 * absent from the push shapes. A client cannot set what it does not send.
 */

const pushMeta = {
  id: Uuid,
  updated_at: IsoDateTime,
  deleted: z.boolean(),
};

const pullMeta = {
  id: Uuid,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
};

// ---------------------------------------------------------------------------
// trips
// ---------------------------------------------------------------------------

export const TripStatus = z.enum(['planning', 'active', 'past']);
export type TripStatus = z.infer<typeof TripStatus>;

const tripFields = {
  title: z.string().trim().min(1).max(200),
  home_currency: CurrencyCode,
  is_public: z.boolean(),
  cover_photo_id: Uuid.nullable(),
};

export const TripPushRecord = z.strictObject({ ...pushMeta, ...tripFields });
export const TripPullRecord = z.strictObject({
  ...pullMeta,
  ...tripFields,
  /** Derived from the stop date range on read — never client-set (FR-013). */
  status: TripStatus,
});

// ---------------------------------------------------------------------------
// trip_stops
// ---------------------------------------------------------------------------

const tripStopFields = {
  trip_id: Uuid,
  city_id: CityId,
  sort_order: z.int().min(0).max(32767),
  arrive_date: IsoDate,
  depart_date: IsoDate,
};

/** FR-011: departure may equal but never precede arrival. */
const departNotBeforeArrive = (s: { arrive_date: string; depart_date: string }) =>
  s.depart_date >= s.arrive_date;

export const TripStopPushRecord = z
  .strictObject({ ...pushMeta, ...tripStopFields })
  .refine(departNotBeforeArrive, {
    message: 'depart_date must not precede arrive_date',
    path: ['depart_date'],
  });
export const TripStopPullRecord = z
  .strictObject({ ...pullMeta, ...tripStopFields })
  .refine(departNotBeforeArrive, {
    message: 'depart_date must not precede arrive_date',
    path: ['depart_date'],
  });

// ---------------------------------------------------------------------------
// expense_categories (custom rows only — system rows are reference data)
// ---------------------------------------------------------------------------

const expenseCategoryFields = {
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(60).nullable(),
};

export const ExpenseCategoryPushRecord = z.strictObject({
  ...pushMeta,
  ...expenseCategoryFields,
});
export const ExpenseCategoryPullRecord = z.strictObject({
  ...pullMeta,
  ...expenseCategoryFields,
});

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------

const noteFields = {
  trip_id: Uuid,
  country_id: CountryId.nullable(),
  city_id: CityId.nullable(),
  title: z.string().max(200).nullable(),
  body: z.string().max(20_000),
  is_public: z.boolean(),
};

/** FR-019: a note must have at least a country anchor. */
const anchored = (n: { country_id: number | null; city_id: number | null }) =>
  n.country_id !== null || n.city_id !== null;

export const NotePushRecord = z.strictObject({ ...pushMeta, ...noteFields }).refine(anchored, {
  message: 'A note must be anchored to a country or a city',
  path: ['country_id'],
});
export const NotePullRecord = z.strictObject({ ...pullMeta, ...noteFields }).refine(anchored, {
  message: 'A note must be anchored to a country or a city',
  path: ['country_id'],
});

// ---------------------------------------------------------------------------
// expenses — owner-only, structurally. There is no visibility field here and
// the strict object refuses one. Adding it is a constitutional violation.
// ---------------------------------------------------------------------------

const expenseFields = {
  trip_id: Uuid,
  city_id: CityId.nullable(),
  category_id: Uuid,
  amount: DecimalString,
  currency: CurrencyCode,
  spent_at: IsoDate,
  note: z.string().max(500).nullable(),
};

/**
 * The device may convert from its cached rate snapshot at entry time (research
 * D-10); if it could not, it sends neither and the server backfills or marks
 * the row `fx_pending`. Whatever is stored first is frozen (FR-022).
 */
const expenseClientFx = {
  fx_rate_to_home: RateString.nullable().optional(),
  amount_home: DecimalString.nullable().optional(),
};

export const ExpensePushRecord = z.strictObject({
  ...pushMeta,
  ...expenseFields,
  ...expenseClientFx,
});
export const ExpensePullRecord = z.strictObject({
  ...pullMeta,
  ...expenseFields,
  fx_rate_to_home: RateString.nullable(),
  amount_home: DecimalString.nullable(),
  fx_pending: z.boolean(),
});

// ---------------------------------------------------------------------------
// photos (metadata only — bytes travel on the upload channel, §4)
// ---------------------------------------------------------------------------

export const UploadState = z.enum(['pending', 'uploaded', 'failed']);
export type UploadState = z.infer<typeof UploadState>;

export const ModerationState = z.enum(['pending', 'approved', 'rejected']);
export type ModerationState = z.infer<typeof ModerationState>;

const photoFields = {
  trip_id: Uuid,
  city_id: CityId.nullable(),
  taken_at: IsoDateTime.nullable(),
  exif_lat: z.number().min(-90).max(90).nullable(),
  exif_lng: z.number().min(-180).max(180).nullable(),
  is_public: z.boolean(),
};

export const PhotoPushRecord = z.strictObject({ ...pushMeta, ...photoFields });
export const PhotoPullRecord = z.strictObject({
  ...pullMeta,
  ...photoFields,
  upload_state: UploadState,
  moderation_state: ModerationState,
  has_thumbnail: z.boolean(),
});

// ---------------------------------------------------------------------------
// documents — owner-only, structurally. No visibility field; strict refusal.
// ---------------------------------------------------------------------------

export const DocumentType = z.enum(['boarding_pass', 'booking', 'other']);
export type DocumentType = z.infer<typeof DocumentType>;

const documentFields = {
  trip_id: Uuid,
  type: DocumentType,
  /** Extracted barcode fields (FR-035). Null when unreadable — not an error state. */
  parsed_json: z.record(z.string(), z.unknown()).nullable(),
  /** Constitution IV: extracted-but-unconfirmed is not fact until this is set. */
  parsed_confirmed_at: IsoDateTime.nullable(),
};

export const DocumentPushRecord = z.strictObject({ ...pushMeta, ...documentFields });
export const DocumentPullRecord = z.strictObject({
  ...pullMeta,
  ...documentFields,
  upload_state: UploadState,
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type TripPushRecord = z.infer<typeof TripPushRecord>;
export type TripPullRecord = z.infer<typeof TripPullRecord>;
export type TripStopPushRecord = z.infer<typeof TripStopPushRecord>;
export type TripStopPullRecord = z.infer<typeof TripStopPullRecord>;
export type ExpenseCategoryPushRecord = z.infer<typeof ExpenseCategoryPushRecord>;
export type ExpenseCategoryPullRecord = z.infer<typeof ExpenseCategoryPullRecord>;
export type NotePushRecord = z.infer<typeof NotePushRecord>;
export type NotePullRecord = z.infer<typeof NotePullRecord>;
export type ExpensePushRecord = z.infer<typeof ExpensePushRecord>;
export type ExpensePullRecord = z.infer<typeof ExpensePullRecord>;
export type PhotoPushRecord = z.infer<typeof PhotoPushRecord>;
export type PhotoPullRecord = z.infer<typeof PhotoPullRecord>;
export type DocumentPushRecord = z.infer<typeof DocumentPushRecord>;
export type DocumentPullRecord = z.infer<typeof DocumentPullRecord>;
