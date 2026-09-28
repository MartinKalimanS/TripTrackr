#!/usr/bin/env tsx
import { importGeoCatalogue } from '../../apps/api/src/db/geo-catalogue';

/**
 * Loads the reference geography catalogue (T038, research D-11, FR-014).
 *
 * ```sh
 * # from the repository root. MIGRATION_DATABASE_URL (the owner: the import
 * # alters the catalogue tables, which the API role may not do) is read from
 * # the root .env by the npm script. It runs in apps/api, so paths are absolute.
 * npm run geo:import -w apps/api -- --countries "$PWD/data/countryInfo.txt" --cities "$PWD/data/cities15000.txt"
 * ```
 *
 * Extracts come from https://download.geonames.org/export/dump/ (CC BY 4.0):
 * `countryInfo.txt` and one of the `citiesN.txt` files, where N is the minimum
 * population. `cities15000.txt` is the launch default at roughly 26,000 places;
 * `cities500.txt` is far broader and takes correspondingly longer.
 *
 * The work lives in `apps/api/src/db/geo-catalogue.ts` rather than here so that
 * the positional column parsing stays unit-testable without a database — for a
 * positional format, that is where the mistakes are. This file is only the CLI.
 *
 * Safe to re-run: every row is upserted on its natural key, so refreshing against
 * a newer extract updates rows in place and leaves `cities.id` stable. Any
 * `trip_stops.city_id` already chosen by a traveller keeps pointing at the same
 * place.
 */

interface Args {
  readonly countries: string;
  readonly cities: string;
}

function parseArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag?.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        values.set(flag.slice(2), next);
        i += 1;
      }
    }
  }

  const countries = values.get('countries');
  const cities = values.get('cities');

  if (!countries || !cities) {
    throw new Error(
      'Both --countries and --cities are required.\n' +
        '  --countries  path to countryInfo.txt\n' +
        '  --cities     path to cities15000.txt (or another citiesN.txt)',
    );
  }

  return { countries, cities };
}

async function main(): Promise<void> {
  // The owner's connection, never the API's: the import ALTERs the catalogue
  // tables, and `triptrackr_api` is deliberately unable to (research D-20).
  const databaseUrl = process.env.MIGRATION_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'MIGRATION_DATABASE_URL is not set. The geography import alters the schema and must ' +
        'run as the database owner, not as the API role.',
    );
  }

  const args = parseArgs(process.argv.slice(2));

  const started = Date.now();
  const result = await importGeoCatalogue({
    databaseUrl,
    countryInfoPath: args.countries,
    citiesPath: args.cities,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  process.stdout.write(
    `Imported ${result.countries} countries and ${result.cities} cities ` +
      `in ${seconds}s (${result.skipped} rows skipped).\n`,
  );
}

main().catch((error: unknown) => {
  // A partial catalogue is worse than none — the picker would silently omit
  // cities — so this exits non-zero and lets the operator re-run it.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
