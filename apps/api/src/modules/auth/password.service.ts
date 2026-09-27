import { Injectable, Logger } from '@nestjs/common';
import { hash, verify, type Options } from '@node-rs/argon2';

/**
 * `Algorithm.Argon2id` from @node-rs/argon2. The library declares its enum
 * `const`, which cannot be imported under `isolatedModules`; the value is
 * spelled out and the PHC string the unit spec asserts on (`$argon2id$`) is
 * what pins it.
 */
const ARGON2ID = 2;

/**
 * Argon2id at the OWASP minimum-recommended cost or above: 19 MiB of memory,
 * two passes, one lane. Pinned here and asserted on the PHC string by the unit
 * spec, so a quiet downgrade is a failing test rather than a weaker hash.
 */
export const ARGON2_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * A real Argon2id hash, at the parameters above, of 32 random bytes that were
 * discarded the moment it was produced. Nothing verifies against it — it exists
 * so that a login for an address with no account, or for an OAuth-only account
 * with no password, costs the caller exactly one verification like every other
 * wrong guess (0006 `auth_find_user_by_email`: "the caller MUST run Argon2
 * verification even when this returns no row").
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$jtdyz8czdslA159j+TyVjw$F6FKG0WZVZlU69rynwYVV/yLNt9yZFvnOdoPlBy30oI';

/**
 * Password hashing and verification (FR-001).
 *
 * Passwords are low-entropy and human-chosen, which is what makes a slow,
 * memory-hard hash right here and wrong for the 256-bit random refresh tokens
 * next door (token.service.ts). Length is the only composition rule the
 * contract imposes (contracts/api/auth.ts) because, once the hash is Argon2id,
 * length is the property that measurably resists offline guessing.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /**
   * True only for the password that produced `storedHash`.
   *
   * A null hash — no such account, or an account that only ever signed in with
   * a provider — is verified against the dummy so the timing matches, and is
   * then refused regardless of what the verification said. A hash the library
   * cannot parse is a data problem, not a request problem: it is logged and
   * treated as a wrong password rather than surfacing as a 500 to whoever
   * happened to type that address.
   */
  async verify(storedHash: string | null, password: string): Promise<boolean> {
    try {
      const matched = await verify(storedHash ?? DUMMY_PASSWORD_HASH, password);
      return storedHash !== null && matched;
    } catch (error: unknown) {
      this.logger.error(
        'A stored password hash could not be verified; treating as a mismatch.',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
