/**
 * A Jest environment that runs a test file with the process in a given time zone.
 *
 *   /**
 *    * @jest-environment <rootDir>/test/env/zone-environment.js
 *    * @jest-environment-options {"zone": "Pacific/Auckland"}
 *    *\/
 *
 * Why an environment and not `process.env.TZ = ...` in the test: inside a test file
 * `process.env` is a COPY of the real one (Jest's sandbox), so assigning to it changes no
 * clock; the runtime reads the zone from the REAL process, and Node re-reads it when the
 * real `process.env.TZ` is assigned (it does on Windows too, checked). This module is
 * loaded outside the sandbox, so it can. It sets the zone while the environment is being
 * built, before the test file or anything it imports has run, so no `Date` or `Intl`
 * object made by the code under test can have seen another zone, and it puts the worker's
 * own zone back afterwards: a worker runs many files one after another.
 *
 * Deleting `TZ` does not restore the zone (checked), so the previous zone is read by name
 * and assigned back.
 */
'use strict';

const ReactNativeEnv = require('@react-native/jest-preset/jest/react-native-env.js');

module.exports = class ZoneEnvironment extends ReactNativeEnv {
  constructor(config, context) {
    super(config, context);
    const zone = (config.projectConfig.testEnvironmentOptions ?? {}).zone;
    if (typeof zone !== 'string' || zone === '') {
      throw new Error(
        'zone-environment: pass the zone with `@jest-environment-options {"zone": "<IANA name>"}`.',
      );
    }
    this.previousZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = zone;
  }

  async teardown() {
    process.env.TZ = this.previousZone;
    await super.teardown();
  }
};
