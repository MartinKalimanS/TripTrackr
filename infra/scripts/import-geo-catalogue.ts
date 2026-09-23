#!/usr/bin/env tsx
import { importGeoCatalogue } from '../../server/src/db/geo-catalogue';

/**
 * Loads the reference geography catalogue (T038, research D-11, FR-014).
 *
 * ```sh
 * cd server
 * npm run geo:import -- --countries ../data/countryInfo.txt --cities ../data/cities15000.txt
 * ```
 *
 * Extracts come from https://download.geonames.org/export/dump/ (CC BY 4.0):
 * `countryInfo.txt` and one of the `citiesN.txt` files, where N is the minimum
 * population. `cities15000.txt` is the launch default at roughly 26,000 places;
 * `cities500.txt` is far broader and takes correspondingly longer.
 *
 * The work lives in `server/src/db/geo-catalogue.ts` rather than here. Node
 * resolves a package from the importing file's directory, and `postgres` is
 * installed under `server/`, so a script in this directory cannot reach it — but
 * a module under `server/` that this file imports resolves its own dependencies
 * normally. Splitting it also leaves the positional column parsing unit-testable
 * without a database, which for a positional format is where the mistakes are.
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
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set.');
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
