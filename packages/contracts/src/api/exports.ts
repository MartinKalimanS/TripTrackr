import { z } from 'zod';

import { IsoDateTime, Uuid } from '../scalars';

/**
 * Export my data (rest-api.md §2; FR-007; spec 009). The traveller asks, the worker builds one zip,
 * and the traveller downloads it through a short-lived signed link while the archive lasts.
 */
export const ExportStatus = z.enum(['pending', 'ready', 'failed', 'expired']);
export type ExportStatus = z.infer<typeof ExportStatus>;

/**
 * `POST /me/export`. The password proves the caller is the traveller and not a stolen access token,
 * as for deletion; an account that signed in with Google or Apple has none to send.
 */
export const StartExportRequest = z.strictObject({
  password: z.string().min(1).max(256).optional(),
});
export type StartExportRequest = z.infer<typeof StartExportRequest>;

export const DataExport = z.strictObject({
  id: Uuid,
  status: ExportStatus,
  requested_at: IsoDateTime,
  /** When the archive goes: set once it is ready, null before. */
  expires_at: IsoDateTime.nullable(),
  /** A fresh signed link, only while `status` is `ready`; valid for minutes, not for the archive's life. */
  download_url: z.url().nullable(),
});
export type DataExport = z.infer<typeof DataExport>;

export const ExportResponse = z.strictObject({ export: DataExport });
export type ExportResponse = z.infer<typeof ExportResponse>;
