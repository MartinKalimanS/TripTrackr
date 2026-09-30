-- 0011_us5_documents_sealed.sql (T209)
--
-- What User Story 5 needs from `documents` that 0002 did not give it
-- (data-model.md §5; research D-32, D-33):
--
--   1. `content_type` — the image type the traveller's device sent, JPEG or
--      PNG, served back with the decrypted bytes. The object at `storage_key`
--      is ciphertext and says nothing about what it holds (D-32).
--   2. `byte_size` — the PLAINTEXT size, for the list; the object's own size is
--      the ciphertext's, which is larger by a nonce and a tag.
--   3. `parsed_sealed` replaces `parsed_json`. The three fields a boarding pass
--      yields — flight number, flight date, passenger name — are sealed with
--      AES-256-GCM under the document's own data key, with the associated data
--      `<id>:parsed` (EnvelopeService.sealParsed). A dump of this table now
--      shows neither who flew nor where: the passenger name was the most
--      personal thing in a plaintext column, and FR-033 names exactly that
--      adversary. The API decrypts for the owner on read.
--
-- Two CHECKs make states the API never writes unrepresentable, as
-- `notes_anchor_check` does for FR-019. They are a backstop, not the answer: the
-- documents service refuses both before any statement runs, because a raised
-- constraint poisons the request transaction (0008's header).
--
--   - only a boarding pass carries extracted fields (rest-api.md §6);
--   - a confirmation needs fields to confirm (Constitution IV).
--
-- Visibility posture: unchanged, and unchangeable. **Owner-only,
-- structurally.** `documents_owner_only` (0005) stays the table's one policy;
-- this file adds no policy, no visibility column, and no function that reaches
-- the table (adversarial row 14, test/privacy/catalogue.spec.ts).
--
-- No row is ever rewritten or invented. The two new NOT NULL columns have no
-- honest default for a row that already exists — a guessed content type would
-- serve a PNG as a JPEG, a guessed size would lie on the list — and dropping
-- `parsed_json` would destroy whatever a row held there. So the migration
-- refuses to run over a non-empty table and says why, rather than making
-- anything up. No document had been written when it was authored (User Story 5
-- is the first story with a documents route); a deployment that somehow holds
-- one must migrate those rows deliberately, by hand, before this runs.

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must bypass RLS (as 0007–0010)
-- ---------------------------------------------------------------------------
--
-- The emptiness check below reads a table under FORCE ROW LEVEL SECURITY. As any
-- role without BYPASSRLS it would see no rows — or raise on the unset session
-- variable — and a table full of documents would pass as empty.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. Under '
      || 'FORCE ROW LEVEL SECURITY any other role reads documents as empty. '
      || 'Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Refuse to invent data for existing rows
-- ---------------------------------------------------------------------------
--
-- Only while the columns are still missing, so that re-running this file over
-- a schema it already produced — and the rows written since — is a no-op, as
-- the rest of the file is.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'content_type'
  ) AND EXISTS (SELECT 1 FROM documents) THEN
    RAISE EXCEPTION USING MESSAGE =
      'documents holds rows. 0011 adds content_type and byte_size, which have no '
      || 'truthful default for an existing row, and drops parsed_json. Migrate '
      || 'those rows deliberately first: read each object, record its type and '
      || 'plaintext size, and re-seal any parsed_json into parsed_sealed.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. content_type, byte_size, parsed_sealed; parsed_json dropped
-- ---------------------------------------------------------------------------
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL
    CONSTRAINT documents_content_type_check
    CHECK (content_type IN ('image/jpeg', 'image/png')),
  ADD COLUMN IF NOT EXISTS byte_size INTEGER NOT NULL
    CONSTRAINT documents_byte_size_check CHECK (byte_size > 0),
  ADD COLUMN IF NOT EXISTS parsed_sealed BYTEA,
  DROP COLUMN IF EXISTS parsed_json;

-- ---------------------------------------------------------------------------
-- 3. Backstops for the two field rules
-- ---------------------------------------------------------------------------
--
-- ADD CONSTRAINT has no IF NOT EXISTS form; guarded as 0007 guards its own.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_parsed_boarding_pass_check'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_parsed_boarding_pass_check
      CHECK (parsed_sealed IS NULL OR type = 'boarding_pass');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_confirmed_has_fields_check'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_confirmed_has_fields_check
      CHECK (parsed_confirmed_at IS NULL OR parsed_sealed IS NOT NULL);
  END IF;
END
$$;
