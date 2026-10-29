/**
 * Export my data (spec 009; FR-007; rest-api.md `POST /me/export`, `GET /me/export/:id`).
 *
 * One hook for the whole sheet: the request, the polling and the phase the sheet draws.
 *
 *   form    -> nothing asked yet (or the traveller chose to try again)
 *   pending -> asked; the server is building the archive (polled every few seconds)
 *   ready   -> `downloadUrl` is a fresh signed link, good for minutes
 *   ended   -> the export failed or its day is over; `restart` returns to the form
 *
 * The daily limit (`429 EXPORT_RATE_LIMITED`) names the earlier export; it is adopted instead of
 * shown as an error, because what the traveller wants is the archive they already asked for.
 * The password is sent once and not kept: the mutation cache drops it at once.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExportResponse } from '@triptrackr/contracts';
import { useState } from 'react';

import { ApiRequestError, apiFetch } from '@/lib/api-client';

const POLL_MS = 3_000;

export type ExportPhase = 'form' | 'pending' | 'ready' | 'ended';

/** The earlier export a daily-limit refusal points at, when it names one. */
function earlierExportId(error: unknown): string | null {
  if (!(error instanceof ApiRequestError) || error.code !== 'EXPORT_RATE_LIMITED') {
    return null;
  }
  const id = error.error.details?.export_id;
  return typeof id === 'string' ? id : null;
}

export function useDataExport() {
  const [exportId, setExportId] = useState<string | null>(null);

  const request = useMutation<ExportResponse, Error, string>({
    gcTime: 0,
    mutationFn: (password) =>
      apiFetch(ExportResponse, '/me/export', {
        method: 'POST',
        body: password === '' ? {} : { password },
      }),
    onSuccess: (answer) => setExportId(answer.export.id),
    onError: (error) => {
      const earlier = earlierExportId(error);
      if (earlier) setExportId(earlier);
    },
  });

  const status = useQuery({
    queryKey: ['data-export', exportId],
    enabled: exportId !== null,
    queryFn: () => apiFetch(ExportResponse, `/me/export/${exportId}`),
    refetchInterval: (query) =>
      query.state.data?.export.status === 'pending' ? POLL_MS : false,
  });

  const current = status.data?.export ?? request.data?.export ?? null;
  const adopted = exportId !== null;

  let phase: ExportPhase = 'form';
  if (adopted) {
    if (current?.status === 'ready') phase = 'ready';
    else if (current?.status === 'failed' || current?.status === 'expired')
      phase = 'ended';
    else phase = 'pending';
  }

  return {
    phase,
    downloadUrl: phase === 'ready' ? (current?.download_url ?? null) : null,
    isStarting: request.isPending,
    error: adopted ? null : request.error,
    start: (password: string) => request.mutate(password),
    restart: () => {
      setExportId(null);
      request.reset();
    },
  };
}
