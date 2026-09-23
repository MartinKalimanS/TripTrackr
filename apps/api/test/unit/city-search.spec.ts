import { escapeLikePattern, foldQuery } from '@/modules/lookups/city-search';

/**
 * The query side of accent-tolerant search (FR-014, research D-11).
 *
 * The catalogue stores `ascii_name` already folded (geo-catalogue.ts). For
 * "Zürich" typed with its umlaut to meet "Zurich" in the index, the query has
 * to be folded the same way before it reaches the database — and it has to be
 * made safe for the LIKE it feeds, or `%` becomes "every city".
 */
describe('foldQuery', () => {
  it('strips diacritics and lower-cases', () => {
    expect(foldQuery('Zürich')).toBe('zurich');
    expect(foldQuery('São Paulo')).toBe('sao paulo');
    expect(foldQuery('Köln')).toBe('koln');
    expect(foldQuery('Genève')).toBe('geneve');
  });

  it('trims surrounding whitespace and collapses runs inside', () => {
    expect(foldQuery('  new   york ')).toBe('new york');
  });

  it('leaves plain ascii alone', () => {
    expect(foldQuery('paris')).toBe('paris');
  });

  it('does not transliterate other scripts — the catalogue’s own ascii name does that', () => {
    expect(foldQuery('東京')).toBe('東京');
  });
});

describe('escapeLikePattern', () => {
  it('escapes the LIKE metacharacters and the escape character itself', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });

  it('passes ordinary text through unchanged', () => {
    expect(escapeLikePattern('paris')).toBe('paris');
  });
});
