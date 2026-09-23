import { loadEnv, loadMigrationEnv, resetEnvCache } from '@/common/config/env.schema';

import { applyUnitTestEnv } from '../support/env';

/**
 * The two-connection-string obligation (research D-20,
 * contracts/data-access-policy.md §1 "Deployment obligation").
 *
 * The scaffold declared one `DATABASE_URL` and every service used it — the
 * owner's. The correction is two schemas for two processes: the API declares
 * only the API-role URL, the migration runner declares only the owner's URL and
 * the role password. A compose file can then hand each container exactly its
 * own variables, and the API container never even has a slot for the owner's
 * credentials to be pasted into.
 */
describe('env schema', () => {
  beforeEach(() => applyUnitTestEnv());
  afterAll(() => resetEnvCache());

  it('accepts a complete environment', () => {
    expect(() => loadEnv()).not.toThrow();
  });

  it('requires DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    resetEnvCache();

    expect(() => loadEnv()).toThrow(/DATABASE_URL/);
  });

  it("does not ask the API process for the owner's variables", () => {
    // Arrange — the API container, holding only what a request path needs.
    delete process.env.MIGRATION_DATABASE_URL;
    delete process.env.API_DB_PASSWORD;
    resetEnvCache();

    // Act + Assert — booting must not depend on credentials the API must not hold.
    expect(() => loadEnv()).not.toThrow();
  });

  it('lists every offending variable at once rather than the first', () => {
    // Arrange — a boot that fails should say everything that is wrong.
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.JWT_ACCESS_SECRET;
    resetEnvCache();

    // Act
    let message = '';
    try {
      loadEnv();
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    // Assert
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/REDIS_URL/);
    expect(message).toMatch(/JWT_ACCESS_SECRET/);
  });

  it('memoises the parsed environment until reset', () => {
    const first = loadEnv();
    process.env.PORT = '9999';

    expect(loadEnv()).toBe(first);

    resetEnvCache();
    expect(loadEnv().PORT).toBe(9999);
  });

  describe('loadMigrationEnv', () => {
    it('needs only the two variables the runner uses, not the whole API environment', () => {
      // Arrange — a migration container holds no S3 credentials and no master key.
      const source: NodeJS.ProcessEnv = {
        MIGRATION_DATABASE_URL: 'postgres://owner:secret@db:5432/triptrackr',
        API_DB_PASSWORD: 'a-sufficiently-long-password',
      };

      // Act + Assert
      expect(loadMigrationEnv(source)).toEqual({
        MIGRATION_DATABASE_URL: 'postgres://owner:secret@db:5432/triptrackr',
        API_DB_PASSWORD: 'a-sufficiently-long-password',
      });
    });

    it('does not accept DATABASE_URL in place of MIGRATION_DATABASE_URL', () => {
      // Arrange — the scaffold's exact mistake: one URL, and it is the API's.
      const source: NodeJS.ProcessEnv = {
        DATABASE_URL: 'postgres://triptrackr_api:x@db:5432/triptrackr',
        API_DB_PASSWORD: 'a-sufficiently-long-password',
      };

      // Act + Assert
      expect(() => loadMigrationEnv(source)).toThrow(/MIGRATION_DATABASE_URL/);
    });

    it('refuses a short API role password', () => {
      const source: NodeJS.ProcessEnv = {
        MIGRATION_DATABASE_URL: 'postgres://owner:secret@db:5432/triptrackr',
        API_DB_PASSWORD: 'short',
      };

      expect(() => loadMigrationEnv(source)).toThrow(/API_DB_PASSWORD/);
    });
  });
});
