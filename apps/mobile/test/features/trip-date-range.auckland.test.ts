/**
 * T430 - `formatDateRange` with the process east of Greenwich (UTC+12 and +13).
 *
 * Here a local-midnight `Date` read in UTC is the day BEFORE, so an implementation that
 * formats in UTC after building local dates would say 31 Dec for 1 Jan (the suite's
 * control proves it). The zone is set by the environment before any module loads.
 *
 * @jest-environment <rootDir>/test/env/zone-environment.js
 * @jest-environment-options {"zone": "Pacific/Auckland"}
 */
import { defineZoneSuite } from './date-range-zone-suite';

defineZoneSuite('Pacific/Auckland', 'utc-format');
