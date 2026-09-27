# Contract — Data Access Policy (RLS)

**Branch**: `001-triptrackr-mvp` | Conventions: [README.md](./README.md)

This is the authority on who may read what. Constitution I requires visibility to be enforced where
data is retrieved, so that a defect in a screen, a route, or a query cannot disclose another
traveller's content. Everything else in the system — endpoint access rules, client-side filtering —
is convenience layered on top of what is specified here.

---

## 1. Session establishment

```sql
SET LOCAL app.current_user_id = '<uuid>';
```

Set by NestJS middleware at the start of each request, **inside the same transaction** the request's
queries run in. `SET LOCAL` scopes it to that transaction, so a pooled connection cannot leak one
traveller's identity into another's request.

**Non-negotiable configuration**, because each of these silently disables the guarantee:

| Requirement                                      | Why                                                                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| The API connects as a **non-superuser** role     | RLS does not apply to superusers. A superuser connection means every policy below is decorative.                                                      |
| Every owned table has `FORCE ROW LEVEL SECURITY` | Without `FORCE`, the _table owner_ bypasses its own policies. This is the configuration where the privacy suite passes in CI and fails in production. |
| An unauthenticated request sets **no** user id   | `current_setting('app.current_user_id')` then raises, and the query fails closed. It must never default to a value.                                   |
| Migrations run as a separate, privileged role    | The API role must never hold the rights to alter policies.                                                                                            |

**Deployment obligation (added 2026-09-23).** The two roles above are two _connection strings_, and
both must be provisioned by every environment that runs the stack:

| Variable                 | Role                                                          | Used by                                   |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------- |
| `DATABASE_URL`           | `triptrackr_api` — non-superuser, no ownership, `NOBYPASSRLS` | the API process and the worker            |
| `MIGRATION_DATABASE_URL` | the database owner                                            | the `migrate` one-shot and the geo import |

The API role's password is supplied through `API_DB_PASSWORD` and applied by the migration runner
(`ALTER ROLE triptrackr_api PASSWORD …`) so that the role exists with credentials before the API
first connects. The original scaffold created the role but never connected as it — every service
used the owner's `DATABASE_URL`, which made the whole of §2 decorative in any environment built from
the shipped configuration. Adversarial test 16 catches a superuser; it cannot catch the API being
pointed at the wrong URL, so test 17 below asserts on `current_user` from inside an API-role
connection.

---

## 2. Policies

### `trips`

```sql
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips FORCE ROW LEVEL SECURITY;

CREATE POLICY trips_owner_all ON trips
  USING (owner_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY trips_public_read ON trips FOR SELECT
  USING (
    is_public = true
    AND deleted_at IS NULL
    AND NOT is_blocked_between(owner_id, current_setting('app.current_user_id')::uuid)
  );
```

`is_blocked_between(a, b)` is a `STABLE` function returning true when either direction of a block
exists. Putting it in the predicate rather than in each query is what makes FR-061 hold on all four
public routes at once.

`deleted_at IS NULL` appears in the _public_ policy specifically: a tombstoned trip must stop being
publicly reachable at once, which is also FR-057's requirement when visibility is revoked.

### `notes`

```sql
CREATE POLICY notes_owner_all ON notes
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY notes_public_read ON notes FOR SELECT
  USING (
    is_public = true
    AND deleted_at IS NULL
    AND trip_id IN (SELECT id FROM trips WHERE is_public = true AND deleted_at IS NULL)
  );
```

Both the note and its trip must be public. FR-053's independent visibility means a public note inside
a private trip stays private — the trip is the outer envelope.

### `photos`

```sql
CREATE POLICY photos_owner_all ON photos
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY photos_public_read ON photos FOR SELECT
  USING (
    is_public = true
    AND moderation_state = 'approved'
    AND deleted_at IS NULL
    AND trip_id IN (SELECT id FROM trips WHERE is_public = true AND deleted_at IS NULL)
  );
```

**`moderation_state = 'approved'` is inside the predicate deliberately.** FR-056 withholds a photo
from public visibility until it has passed screening _irrespective of the visibility its owner set_.
Checking that in a service method would leave the guarantee one bug away from failing; here, an
unscreened photo is unreachable publicly even if every layer above it is wrong.

### `expenses` and `documents`

```sql
CREATE POLICY expenses_owner_only ON expenses
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY documents_owner_only ON documents
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));
```

**No public-read policy exists for either table, and none may ever be added.**

This is the single most important property in the schema. FR-027 and FR-032 are enforced by the
_absence_ of a mechanism, not by a flag that application code has to remember to check. There is no
`is_public` column to set wrongly, and no policy that could return someone else's row. A change that
adds either is a constitutional violation (Principle I), not a feature, and must be rejected in
review regardless of what it enables.

### `users`

```sql
CREATE POLICY users_self_all ON users
  USING (id = current_setting('app.current_user_id')::uuid);

CREATE POLICY users_public_read ON users FOR SELECT
  USING (
    is_profile_public = true
    AND deletion_requested_at IS NULL
    AND NOT is_blocked_between(id, current_setting('app.current_user_id')::uuid)
  );
```

Column-level exposure — only `display_name`, `avatar_url`, and `bio` reach a public view — is the
serialiser's job. `email` and `password_hash` never appear in any public representation.

`deletion_requested_at IS NULL` covers the spec's edge case where a traveller with a public trip
deletes their account: the profile and its trips stop being publicly reachable immediately, before
the sweep has finished running.

### `subscriptions`

```sql
CREATE POLICY subscriptions_owner_only ON subscriptions
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

**No other policy in this document references this table.** That absence is the mechanism behind
Constitution V and FR-080: entitlement state cannot affect the visibility, retention, or readability
of anything recorded, because no read path can see it.

### Write policies must pin the actor (added 2026-09-23)

A permissive policy written with `USING` alone doubles as its own `WITH CHECK`, which is correct for
tables whose ownership column is the thing being tested (`trips.owner_id`, `notes.trip_id`, …) but
wrong wherever a row names **two** parties or has a **shared** variant. Audit of the scaffold found
four such over-grants; the policies below are the corrected shape and are normative.

```sql
-- follows: a traveller may create a request only AS the follower, and only the
-- followee may move it out of `pending`.
CREATE POLICY follows_participant_read ON follows FOR SELECT
  USING (follower_id = current_user_id() OR followee_id = current_user_id());
CREATE POLICY follows_follower_insert ON follows FOR INSERT
  WITH CHECK (follower_id = current_user_id() AND status = 'pending');
CREATE POLICY follows_followee_update ON follows FOR UPDATE
  USING (followee_id = current_user_id())
  WITH CHECK (followee_id = current_user_id());
CREATE POLICY follows_participant_delete ON follows FOR DELETE
  USING (follower_id = current_user_id() OR followee_id = current_user_id());

-- expense_categories: system rows (user_id IS NULL) are readable by all and
-- writable by nobody; custom rows are owner-only in every direction.
CREATE POLICY expense_categories_read ON expense_categories FOR SELECT
  USING (user_id IS NULL OR user_id = current_user_id());
CREATE POLICY expense_categories_owner_write ON expense_categories
  FOR ALL USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());
```

`current_user_id()` is `current_setting('app.current_user_id')::uuid` wrapped in a `STABLE`
function so the cast and the raise-when-unset behaviour live in one place.

`refresh_tokens` and `subscriptions` get **SELECT-only** policies for the API role. Their writes go
through `SECURITY DEFINER` functions (`auth_*`, `billing_*`) owned by the migration role, so a
compromised or buggy request path cannot mint a credential or grant itself an entitlement by writing
the row directly. The direct `INSERT/UPDATE/DELETE` grants on these two tables are revoked from
`triptrackr_api`.

---

## 3. What the policies deliberately do not do

| Not enforced here                    | Enforced where     | Why                                                                                                     |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------- |
| The trip allowance                   | `POST /trips` only | A limit in a read policy would hide trips when an entitlement lapsed — the exact Principle V violation. |
| Curating a public trip view (FR-055) | Serialisation      | RLS decides reachability; shaping the response is a presentation concern.                               |
| Rate limiting                        | Traefik and Redis  | Not a row-visibility question.                                                                          |
| Column-level public exposure         | Serialisers        | RLS is row-level; the two work together and neither substitutes for the other.                          |

---

## 4. Adversarial test suite — required CI job

Constitution III: privacy is tested **as an attacker**. Testing that an owner can see their own data
tests the wrong direction. These run against a real PostgreSQL (Testcontainers), never a mock, and
the job is required on every release.

Fixture: account **A** owns a public trip containing one public note, one private note, one approved
public photo, one pending photo, three expenses, and one document. Account **B** does not follow A.
Account **C** is blocked by A.

| #   | As   | Attempt                                                                           | Expected                                   | Requirement      |
| --- | ---- | --------------------------------------------------------------------------------- | ------------------------------------------ | ---------------- |
| 1   | B    | Read A's expenses by trip id                                                      | Empty                                      | FR-027, SC-012   |
| 2   | B    | Read A's expenses by direct expense id                                            | Empty                                      | FR-027, SC-012   |
| 3   | B    | Read A's expense summary                                                          | Refused                                    | FR-027           |
| 4   | B    | Read A's documents by every available route                                       | Empty                                      | FR-032, SC-012   |
| 5   | B    | Read A's private note                                                             | Empty                                      | FR-053, SC-013   |
| 6   | B    | Read A's pending-moderation photo                                                 | Empty                                      | FR-056, SC-014   |
| 7   | B    | Read A's public note in A's _private_ trip                                        | Empty                                      | FR-053           |
| 8   | C    | Read A's profile, public trip, feed entry, discovery entry                        | Empty on all four                          | FR-061           |
| 9   | B    | Read a trip A made public then private again                                      | Empty                                      | FR-057           |
| 10  | B    | Read A's tombstoned trip                                                          | Empty                                      | FR-057           |
| 11  | B    | Write to any of A's rows                                                          | Refused                                    | Ownership        |
| 12  | B    | Read A's rows while A's entitlement is lapsed                                     | Identical to the active-entitlement result | FR-080, SC-021   |
| 13  | anon | Any query with no session variable set                                            | Fails closed, never returns rows           | §1               |
| 14  | —    | Assert no public-read policy exists on `expenses` or `documents`                  | Passes                                     | FR-027, FR-032   |
| 15  | —    | Assert every owned table has RLS **enabled and forced**                           | Passes                                     | §1               |
| 16  | —    | Assert the API role is not a superuser and lacks policy-alter rights              | Passes                                     | §1               |
| 17  | —    | Assert the API's `DATABASE_URL` connects as `triptrackr_api`, not the owner       | Passes                                     | §1 deployment    |
| 18  | B    | Insert a `follows` row with `follower_id = A`, or accept a request addressed to A | Refused                                    | §2 write pinning |
| 19  | B    | Insert, update, or delete an `expense_categories` row with `user_id IS NULL`      | Refused                                    | §2 write pinning |
| 20  | B    | Insert into `refresh_tokens` or `subscriptions` directly                          | Refused (no grant)                         | §2 write pinning |

Tests 14 through 17 assert on `pg_catalog` and on the live connection rather than on behaviour. They
exist because the configuration mistakes in §1 are silent: every behavioural test above still passes
while the guarantee is entirely absent. A behavioural suite cannot detect its own disablement.
