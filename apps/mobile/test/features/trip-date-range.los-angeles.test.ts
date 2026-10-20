/**
 * T430 - `formatDateRange` with the process west of Greenwich (UTC-8 and -7).
 *
 * Here `new Date('2026-01-01')` (UTC midnight) is the evening of 31 Dec, so an
 * implementation that parses the day as an instant would say 31 Dec for 1 Jan (the
 * suite's control proves it). The zone is set by the environment before any module loads.
 *
 * @jest-environment <rootDir>/test/env/zone-environment.js
 * @jest-environment-options {"zone": "America/Los_Angeles"}
 */
import { defineZoneSuite } from './date-range-zone-suite';

defineZoneSuite('America/Los_Angeles', 'utc-parse');
