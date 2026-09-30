import { Injectable } from '@nestjs/common';
import {
  DocumentParsedFields,
  type CreateDocumentRequest,
  type DocumentType,
  type PatchDocumentRequest,
} from '@triptrackr/contracts';

import { EnvelopeService, type WrappedKey } from '@/common/crypto/envelope.service';

import { documentInvalid, nothingToConfirm } from './documents.errors';

/**
 * What a write does to `parsed_confirmed_at`: set it to the transaction's
 * `now()`, clear it, or leave it as it is.
 */
export type Confirmation = 'now' | 'clear' | 'keep';

/** The facts about a row's fields that the patch rules read — no decryption needed. */
export interface FieldsOnRow {
  readonly type: DocumentType;
  readonly hasFields: boolean;
  readonly confirmed: boolean;
}

/**
 * The write a patch resolves to. An absent `type` or `fields` leaves the column
 * untouched — for the fields, the sealed blob is not even re-sealed.
 */
export interface FieldsChange {
  readonly type?: DocumentType;
  readonly fields?: DocumentParsedFields | null;
  readonly confirmation: Confirmation;
}

const ONLY_ON_BOARDING_PASS = 'Only a boarding pass carries extracted fields';

/**
 * A boarding pass's extracted fields on the API (FR-035, Constitution IV;
 * research D-33; tasks.md T115).
 *
 * The barcode never reaches the API: the device decodes it and runs
 * `parseBoardingPass()` from `@triptrackr/contracts`, which yields exactly the
 * flight number, the flight date and the passenger name as printed. What this
 * service owns is what happens to those three fields afterwards:
 *
 *   - **At rest they are sealed** under the document's own data key with the
 *     associated data `<id>:parsed` (EnvelopeService.sealParsed), so a database
 *     dump shows neither the name nor the flight. On the way out they are
 *     validated against `DocumentParsedFields` again: a blob that decrypts to
 *     anything else is a defect, never a response.
 *   - **They are a proposal until confirmed.** An upload carries them as
 *     proposed, or as confirmed on the device (possibly offline); a PATCH
 *     confirms, corrects or clears them later, by the rules of rest-api.md §6.
 *     Unconfirmed extraction is never presented as fact.
 *   - **Only a boarding pass carries them**, judged on the row a write
 *     produces, before any statement runs.
 *
 * Visibility posture: owner-only. The fields reach this service from the
 * owner's request and leave it only in the owner's response; nothing here logs
 * or reports them, and a decryption failure carries no plaintext.
 */
@Injectable()
export class BoardingPassService {
  constructor(private readonly envelope: EnvelopeService) {}

  /** The fields sealed for the column, or null for none. */
  seal(
    key: WrappedKey,
    documentId: string,
    fields: DocumentParsedFields | null,
  ): Buffer | null {
    if (fields === null) return null;

    const plaintext = Buffer.from(JSON.stringify(fields), 'utf8');
    return this.envelope.sealParsed(key, documentId, plaintext);
  }

  /** The column opened for the owner, or null for none. Throws on anything else. */
  open(
    key: WrappedKey,
    documentId: string,
    sealed: Buffer | null,
  ): DocumentParsedFields | null {
    if (sealed === null) return null;

    return decodeFields(this.envelope.openParsed(key, documentId, sealed), documentId);
  }

  /**
   * Whether an upload's fields are stored confirmed. The wire refuses both
   * inconsistencies already; they are refused again here so the rule does not
   * depend on which path reached the service.
   */
  confirmedOnCreate(
    request: Pick<CreateDocumentRequest, 'type' | 'parsed_json' | 'confirmed'>,
  ): boolean {
    const hasFields = request.parsed_json !== null;

    assertFieldsBelong(request.type, hasFields);
    if (request.confirmed && !hasFields) {
      throw documentInvalid('confirmed', 'There are no fields to confirm');
    }

    return request.confirmed;
  }

  /**
   * rest-api.md §6: fields sent with `confirmed: true` are stored confirmed;
   * fields sent without it replace the proposal and clear any confirmation;
   * `parsed_json: null` clears both; `confirmed: true` alone confirms the stored
   * proposal — `409 DOCUMENT_NOTHING_TO_CONFIRM` when there is none — and keeps
   * an existing confirmation's time, so a replayed confirmation moves nothing.
   */
  resolvePatch(current: FieldsOnRow, patch: PatchDocumentRequest): FieldsChange {
    const type = patch.type ?? current.type;
    const fields = patch.parsed_json;
    const confirmation = confirmationFor(current, patch);
    const hasFields = fields === undefined ? current.hasFields : fields !== null;

    assertFieldsBelong(type, hasFields);

    return {
      ...(patch.type !== undefined && { type: patch.type }),
      ...(fields !== undefined && { fields }),
      confirmation,
    };
  }
}

/**
 * Decrypted bytes → the three fields, or a defect named by document id alone.
 *
 * Neither `JSON.parse`'s error nor the schema's issues are let through: the
 * first quotes the text it choked on, and a 5xx is logged with its message —
 * which must never carry a passenger's name.
 */
function decodeFields(plaintext: Buffer, documentId: string): DocumentParsedFields {
  const fields = DocumentParsedFields.safeParse(parseJson(plaintext.toString('utf8')));

  if (!fields.success) {
    throw new Error(
      `The sealed fields of document ${documentId} did not decrypt to boarding-pass fields.`,
    );
  }

  return fields.data;
}

/** The parsed value, or undefined for text that is not JSON — which the schema then refuses. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function confirmationFor(
  current: FieldsOnRow,
  patch: PatchDocumentRequest,
): Confirmation {
  if (patch.parsed_json !== undefined) {
    return patch.parsed_json !== null && patch.confirmed ? 'now' : 'clear';
  }
  if (!patch.confirmed) return 'keep';
  if (!current.hasFields) throw nothingToConfirm();

  return current.confirmed ? 'keep' : 'now';
}

function assertFieldsBelong(type: DocumentType, hasFields: boolean): void {
  if (hasFields && type !== 'boarding_pass') {
    throw documentInvalid('parsed_json', ONLY_ON_BOARDING_PASS);
  }
}
