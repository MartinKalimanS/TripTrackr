/**
 * T118 / T212 — capturing a document: re-encoding, scanning, sealing, storing
 * (FR-031, FR-033, FR-035; research D-32, D-33).
 *
 * The capture helpers run for real over the faithful doubles in
 * document-doubles.ts (file system, AES-GCM, image editor) and a real SQLite
 * database. Pinned: every capture is re-encoded as a JPEG no larger than
 * 2048 px on its long edge, which drops EXIF; the camera's or picker's
 * temporary and the editor's output are both deleted, on success and on
 * failure; a barcode is read with the shared BCBP parser and anything else is
 * manual entry, never an error; and a stored document is a pending, sealed,
 * local row whose fields are a proposal.
 */
import { parseBoardingPass } from '@triptrackr/contracts';
import { scanFromURLAsync } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import { launchImageLibraryAsync } from 'expo-image-picker';

import { documentsRepository } from '@/db/repositories/documents';
import { tripsRepository } from '@/db/repositories/trips';
import {
  JPEG_QUALITY,
  MAX_LONG_EDGE,
  PASS_BARCODE_TYPES,
  fieldsFromScans,
  longEdgeResize,
  pickDocumentImage,
  reencodeAsJpeg,
  scanImageForPass,
  storeDocument,
} from '@/features/documents/capture';
import { openSealedFile } from '@/features/documents/document-vault';
import { Sentry } from '@/lib/sentry';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import {
  FAKE_CACHE_ROOT,
  fakeJpegText,
  type FakeFileSystemModule,
  type FakeImageManipulatorModule,
} from './document-doubles';

jest.mock('expo-file-system', () => require('./document-doubles').fileSystemDouble());
jest.mock('expo-crypto', () => require('./document-doubles').cryptoDouble());
jest.mock('expo-image-manipulator', () =>
  require('./document-doubles').imageManipulatorDouble(),
);
jest.mock('expo-camera', () => ({ scanFromURLAsync: jest.fn(async () => []) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const fileSystem = jest.requireMock('expo-file-system') as FakeFileSystemModule;
const manipulator = jest.requireMock(
  'expo-image-manipulator',
) as FakeImageManipulatorModule;
const scan = scanFromURLAsync as jest.Mock;
const pick = launchImageLibraryAsync as jest.Mock;
const secureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

/** The worked example in IATA Resolution 792: AC834 on day 326. */
const IATA_EXAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';
const TODAY = '2026-11-20';
const CAMERA_OUTPUT = `${FAKE_CACHE_ROOT}/Camera/5A1B.jpg`;

let sqlite: TestSqlite;

beforeEach(async () => {
  fileSystem.__reset();
  manipulator.__reset();
  secureStore.__reset();
  fileSystem.__seed(CAMERA_OUTPUT, 'RAW CAMERA JPEG WITH EXIF GPS 45.5,-73.6');
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

function filesOnDisk(): string[] {
  return [...fileSystem.__files().keys()];
}

describe('longEdgeResize (≤ 2048 px on the long edge)', () => {
  test.each([
    [4032, 3024, { width: MAX_LONG_EDGE }],
    [3024, 4032, { height: MAX_LONG_EDGE }],
    [2049, 2049, { width: MAX_LONG_EDGE }],
    [2048, 1536, null],
    [800, 600, null],
    [0, 0, null],
  ])('%i×%i → %j', (width, height, expected) => {
    expect(longEdgeResize(width, height)).toEqual(expected);
  });
});

describe('reencodeAsJpeg', () => {
  test('a large capture is scaled to 2048 px on its long edge and saved as JPEG', async () => {
    manipulator.__decodeAs(4032, 3024);

    const output = await reencodeAsJpeg(CAMERA_OUTPUT);

    const saved = Buffer.from(fileSystem.__files().get(output) ?? []).toString();
    expect(saved).toBe(fakeJpegText(2048, 1536));
    const refs = manipulator.__handed() as unknown as { saveAsync?: jest.Mock }[];
    const saveCall = refs.find((ref) => ref.saveAsync?.mock.calls.length)?.saveAsync;
    expect(saveCall).toHaveBeenCalledWith({ format: 'jpeg', compress: JPEG_QUALITY });
  });

  test('a small capture keeps its size but is still re-encoded, which drops its EXIF', async () => {
    manipulator.__decodeAs(1200, 900);

    const output = await reencodeAsJpeg(CAMERA_OUTPUT);

    expect(Buffer.from(fileSystem.__files().get(output) ?? []).toString()).toBe(
      fakeJpegText(1200, 900),
    );
    expect(output).not.toBe(CAMERA_OUTPUT);
  });

  test('deletes the camera’s temporary at once and releases every native image', async () => {
    manipulator.__decodeAs(4032, 3024);

    const output = await reencodeAsJpeg(CAMERA_OUTPUT);

    expect(filesOnDisk()).toEqual([output]);
    for (const handed of manipulator.__handed()) {
      expect(handed.release).toHaveBeenCalled();
    }
  });

  test('deletes the temporary even when the image cannot be decoded, and says so', async () => {
    manipulator.__failNextRender(new Error('Could not decode image'));

    await expect(reencodeAsJpeg(CAMERA_OUTPUT)).rejects.toThrow('Could not decode image');
    expect(filesOnDisk()).toEqual([]);
  });
});

describe('reading a boarding pass (research D-33)', () => {
  test('fieldsFromScans reads the first barcode that is a BCBP pass', () => {
    expect(
      fieldsFromScans(
        [{ data: 'https://example.com/booking/123' }, { data: IATA_EXAMPLE }],
        TODAY,
      ),
    ).toEqual({
      flight_number: 'AC834',
      flight_date: '2026-11-22',
      passenger_name: 'DESMARAIS/LUC',
    });
  });

  test('no barcode, or an unrecognised one, is manual entry — null, never an error', () => {
    expect(fieldsFromScans([], TODAY)).toBeNull();
    expect(fieldsFromScans([{ data: 'WIFI:S:hotel;;' }], TODAY)).toBeNull();
  });

  test('scanImageForPass decodes a picked image for PDF417, Aztec and QR', async () => {
    scan.mockResolvedValueOnce([{ type: 'pdf417', data: IATA_EXAMPLE }]);

    await expect(scanImageForPass(CAMERA_OUTPUT, TODAY)).resolves.toEqual(
      parseBoardingPass(IATA_EXAMPLE, TODAY),
    );
    expect(scan).toHaveBeenCalledWith(CAMERA_OUTPUT, PASS_BARCODE_TYPES);
    expect(PASS_BARCODE_TYPES).toEqual(['pdf417', 'aztec', 'qr']);
  });

  test('an image the scanner cannot load falls back to manual entry, reported', async () => {
    const failure = new Error('FailedToLoadImage');
    scan.mockRejectedValueOnce(failure);

    await expect(scanImageForPass(CAMERA_OUTPUT, TODAY)).resolves.toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
  });
});

describe('pickDocumentImage', () => {
  test('asks the library for one image, unedited, without EXIF or base64, and returns its copy', async () => {
    pick.mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: `${FAKE_CACHE_ROOT}/ImagePicker/pass.jpeg`, width: 1170, height: 2532 },
      ],
    });

    await expect(pickDocumentImage()).resolves.toBe(
      `${FAKE_CACHE_ROOT}/ImagePicker/pass.jpeg`,
    );
    expect(pick).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      exif: false,
      base64: false,
      quality: 1,
    });
  });

  test('a cancelled or empty pick is null', async () => {
    pick.mockResolvedValueOnce({ canceled: true, assets: null });
    await expect(pickDocumentImage()).resolves.toBeNull();
    pick.mockResolvedValueOnce({ canceled: false, assets: [] });
    await expect(pickDocumentImage()).resolves.toBeNull();
  });
});

describe('storeDocument (T211, T212)', () => {
  function newTrip() {
    return tripsRepository.create(sqlite.db, {
      id: randomUUID(),
      title: 'Montréal',
      home_currency: 'CAD',
    });
  }

  test('seals the re-encoded image and writes a pending, local row with the fields as a proposal', async () => {
    const trip = newTrip();
    const fields = parseBoardingPass(IATA_EXAMPLE, TODAY);

    const document = await storeDocument(sqlite.db, {
      tripId: trip.id,
      type: 'boarding_pass',
      temporaryUri: CAMERA_OUTPUT,
      parsed: fields,
    });

    expect(document).toMatchObject({
      trip_id: trip.id,
      type: 'boarding_pass',
      parsed_json: fields,
      parsed_confirmed_at: null,
      upload_state: 'pending',
      is_dirty: true,
      local_file_uri: `document-vault/${document.id}.sealed`,
    });
    expect(documentsRepository.byId(sqlite.db, document.id)?.id).toBe(document.id);
    const opened = await openSealedFile(document.id, document.local_file_uri ?? '');
    expect(Buffer.from(opened, 'base64').toString()).toBe(fakeJpegText(1000, 750));
  });

  test('leaves nothing on disk but the sealed file: no camera temporary, no editor output', async () => {
    const trip = newTrip();

    const document = await storeDocument(sqlite.db, {
      tripId: trip.id,
      type: 'other',
      temporaryUri: CAMERA_OUTPUT,
      parsed: null,
    });

    expect(filesOnDisk()).toHaveLength(1);
    expect(filesOnDisk()[0]).toMatch(
      new RegExp(`document-vault/${document.id}\\.sealed$`),
    );
  });

  test('keeps fields only on a boarding pass', async () => {
    const trip = newTrip();

    const booking = await storeDocument(sqlite.db, {
      tripId: trip.id,
      type: 'booking',
      temporaryUri: CAMERA_OUTPUT,
      parsed: parseBoardingPass(IATA_EXAMPLE, TODAY),
    });

    expect(booking.parsed_json).toBeNull();
  });

  test('a row that cannot be written takes its sealed file with it, and the error propagates', async () => {
    await expect(
      storeDocument(sqlite.db, {
        tripId: randomUUID(), // no such trip: the foreign key refuses the row
        type: 'other',
        temporaryUri: CAMERA_OUTPUT,
        parsed: null,
      }),
    ).rejects.toThrow();

    expect(filesOnDisk()).toEqual([]);
  });

  test('a capture that cannot be re-encoded stores nothing and leaves nothing', async () => {
    const trip = newTrip();
    manipulator.__failNextRender(new Error('Could not decode image'));

    await expect(
      storeDocument(sqlite.db, {
        tripId: trip.id,
        type: 'other',
        temporaryUri: CAMERA_OUTPUT,
        parsed: null,
      }),
    ).rejects.toThrow('Could not decode image');

    expect(filesOnDisk()).toEqual([]);
    expect(documentsRepository.forTripQuery(sqlite.db, trip.id).all()).toEqual([]);
  });
});
