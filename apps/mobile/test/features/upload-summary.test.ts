/** The upload summary line and the tick (T549; FR-045; Constitution II). */
import {
  JUST_SYNCED_MS,
  isJustSynced,
  summarizeUploads,
} from '@/features/photos/upload-summary';

const p = (id: string, upload_state: 'pending' | 'failed' | 'uploaded') => ({
  id,
  upload_state,
});

describe('summarizeUploads', () => {
  test('nothing unfinished draws nothing', () => {
    expect(summarizeUploads([])).toBeNull();
    expect(summarizeUploads([p('a', 'uploaded')])).toBeNull();
  });

  test('says how many are waiting and how many failed, in words', () => {
    const summary = summarizeUploads([
      p('a', 'pending'),
      p('b', 'pending'),
      p('c', 'failed'),
      p('d', 'uploaded'),
    ]);
    expect(summary).toMatchObject({ waiting: 2, failed: 1, uploaded: 1, total: 4 });
    expect(summary?.parts).toEqual(['2 waiting to upload', '1 failed']);
    expect(summary?.failedIds).toEqual(['c']);
    expect(summary?.label).toBe('Photos: 2 waiting to upload, 1 failed');
  });

  test('only the part that applies is said', () => {
    expect(summarizeUploads([p('a', 'pending')])?.parts).toEqual(['1 waiting to upload']);
    expect(summarizeUploads([p('a', 'failed')])?.parts).toEqual(['1 failed']);
  });

  test('never claims progress it does not have: no "uploading N of M"', () => {
    const summary = summarizeUploads([p('a', 'pending'), p('b', 'uploaded')]);
    expect(summary?.parts.join(' ')).not.toMatch(/uploading|\bof\b/i);
  });
});

describe('isJustSynced', () => {
  const now = Date.parse('2026-10-14T12:00:00.000Z');
  const at = (ms: number) => new Date(now - ms).toISOString();
  const synced = (overrides = {}) => ({
    upload_state: 'uploaded' as const,
    synced_at: at(1000),
    local_file_uri: 'photos/t/a.jpg',
    ...overrides,
  });

  test('an upload that landed a moment ago', () => {
    expect(isJustSynced(synced(), now)).toBe(true);
    expect(isJustSynced(synced({ synced_at: at(JUST_SYNCED_MS) }), now)).toBe(true);
  });

  test('an older upload carries no mark', () => {
    expect(isJustSynced(synced({ synced_at: at(JUST_SYNCED_MS + 1) }), now)).toBe(false);
  });

  test('a photograph not uploaded from here is not "just synced"', () => {
    expect(isJustSynced(synced({ upload_state: 'pending' }), now)).toBe(false);
    expect(isJustSynced(synced({ upload_state: 'failed' }), now)).toBe(false);
    expect(isJustSynced(synced({ synced_at: null }), now)).toBe(false);
    expect(isJustSynced(synced({ local_file_uri: '' }), now)).toBe(false);
    expect(isJustSynced(synced({ synced_at: 'garbage' }), now)).toBe(false);
  });

  test('a clock that ran backwards shows nothing', () => {
    expect(isJustSynced(synced({ synced_at: at(-60_000) }), now)).toBe(false);
  });
});
