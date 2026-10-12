/**
 * T544 - the day strip with the process west of Greenwich (UTC-8 and -7). Los Angeles puts
 * the clocks back on 1 Nov 2026, a 25-hour day.
 *
 * @jest-environment <rootDir>/test/env/zone-environment.js
 * @jest-environment-options {"zone": "America/Los_Angeles"}
 */
import { defineZoneSuite } from './trip-days-zone-suite';

defineZoneSuite('America/Los_Angeles', '2026-11-01', ['2026-11-01', '2026-11-03']);
