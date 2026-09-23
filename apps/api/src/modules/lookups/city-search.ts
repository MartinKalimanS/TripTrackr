/**
 * The query side of accent-tolerant city search (FR-014, research D-11).
 *
 * The catalogue stores `ascii_name` already folded (db/geo-catalogue.ts
 * `stripAccents`). For "Zürich" typed with its umlaut to meet "Zurich" in the
 * trigram index, the query has to be folded the same way before it reaches the
 * database. Folding happens here, in one place, rather than with `unaccent()`
 * in SQL: the extension is not enabled, and one deterministic rule on both
 * sides is simpler to reason about than two.
 */

/**
 * Lower-cased, diacritics removed, whitespace trimmed and collapsed.
 *
 * NFD splits a precomposed character into its base letter plus a combining
 * mark; every combining mark carries the `Diacritic` property, so removing
 * those leaves the base letters behind. Other scripts pass through untouched —
 * the catalogue's own `ascii_name` romanises those, and this does not try to.
 */
export function foldQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Makes a value safe as a LIKE prefix. `%` and `_` are wildcards in a LIKE
 * pattern, and the backslash is the escape character — left alone, a traveller
 * typing `%` would match every city in the country.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
