/**
 * T544 - the day strip with the process east of Greenwich (UTC+12 and +13). Auckland's
 * summer time ends on 5 Apr 2026, a 25-hour day.
 *
 * @jest-environment <rootDir>/test/env/zone-environment.js
 * @jest-environment-options {"zone": "Pacific/Auckland"}
 */
import { defineZoneSuite } from './trip-days-zone-suite';

defineZoneSuite('Pacific/Auckland', '2026-04-05', ['2026-04-05', '2026-04-07']);
