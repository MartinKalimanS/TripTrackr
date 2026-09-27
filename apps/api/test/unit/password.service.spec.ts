import { DUMMY_PASSWORD_HASH, PasswordService } from '@/modules/auth/password.service';

/**
 * Password hashing (FR-001; contracts/api/auth.ts on why length is the only
 * composition rule). Argon2id with the OWASP minimum-recommended parameters
 * or stronger — memory 19 MiB, two passes — pinned in the PHC string so a
 * quiet downgrade is a failing test.
 */
describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id at the pinned parameters', async () => {
    const hash = await service.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=\d+\$/);

    const [, memory, time] = /m=(\d+),t=(\d+)/.exec(hash) ?? [];
    expect(Number(memory)).toBeGreaterThanOrEqual(19_456);
    expect(Number(time)).toBeGreaterThanOrEqual(2);
  });

  it('salts: the same password never hashes the same way twice', async () => {
    const [first, second] = await Promise.all([
      service.hash('correct horse battery staple'),
      service.hash('correct horse battery staple'),
    ]);

    expect(first).not.toBe(second);
  });

  it('verifies the password that produced the hash and refuses any other', async () => {
    const hash = await service.hash('correct horse battery staple');

    await expect(service.verify(hash, 'correct horse battery staple')).resolves.toBe(
      true,
    );
    await expect(service.verify(hash, 'correct horse battery stapl')).resolves.toBe(
      false,
    );
  });

  it('runs a real verification against the dummy hash when there is no hash, and still refuses', async () => {
    // The enumeration defence (rest-api.md §1): an unknown address and an
    // OAuth-only account both have no hash to check, and both must cost the
    // caller the same time as a wrong password.
    const started = process.hrtime.bigint();
    const result = await service.verify(null, 'anything at all');
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

    expect(result).toBe(false);
    // Argon2 at these parameters is milliseconds, not microseconds; a shortcut
    // that skipped the work would come back in well under one.
    expect(elapsedMs).toBeGreaterThan(0.5);
  });

  it('carries a dummy hash with the same parameters as a real one', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('refuses a hash it cannot parse rather than throwing into the request', async () => {
    // A row seeded with a placeholder (the integration harness does this) must
    // read as "wrong password", not as a 500.
    await expect(service.verify('$argon2id$seeded$notarealhash', 'x')).resolves.toBe(
      false,
    );
  });
});
