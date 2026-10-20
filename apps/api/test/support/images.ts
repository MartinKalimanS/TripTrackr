import sharp from 'sharp';
import type { Exif } from 'sharp';

/**
 * Image fixtures for the photo suites (tasks.md T107–T109, T113), made on the
 * spot with `sharp` so no binary file is committed and every property a test
 * asserts on — size, orientation, embedded EXIF — is visible where the test
 * builds it.
 */

export interface JpegOptions {
  readonly width?: number;
  readonly height?: number;
  /** An EXIF orientation (1–8) stamped on the file, as a phone camera does. */
  readonly orientation?: number;
  /** EXIF blocks to embed, keyed as `sharp`'s `withExif` takes them. */
  readonly exif?: Exif;
}

/** A solid-colour JPEG. 640×480 unless told otherwise. */
export async function jpeg(options: JpegOptions = {}): Promise<Buffer> {
  const base = sharp({
    create: {
      width: options.width ?? 640,
      height: options.height ?? 480,
      channels: 3,
      background: { r: 32, g: 96, b: 160 },
    },
  }).jpeg({ quality: 90 });

  const oriented = options.orientation
    ? base.withMetadata({ orientation: options.orientation })
    : base;

  return (options.exif ? oriented.withExif(options.exif) : oriented).toBuffer();
}

/** A WebP carrying EXIF — decodable by `sharp`, a format `exifr` does not read. */
export function webpWithExif(exif: Exif): Promise<Buffer> {
  return sharp({
    create: { width: 900, height: 300, channels: 3, background: { r: 0, g: 160, b: 64 } },
  })
    .webp()
    .withExif(exif)
    .toBuffer();
}

/** A PNG with an alpha channel — a screenshot, say. */
export function transparentPng(width = 120, height = 80): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
}

export interface CaptureFixture {
  readonly lat: number;
  readonly lng: number;
  /** The camera's wall clock, as EXIF writes it: `YYYY:MM:DD HH:MM:SS`. */
  readonly local: string;
  /** `OffsetTimeOriginal`, e.g. `+02:00`. Omitted, the clock names no instant. */
  readonly offset?: string;
}

/** EXIF blocks for a photo taken at a place and a time, as a phone writes them. */
export function exifAt(capture: CaptureFixture): Exif {
  return {
    IFD2: {
      DateTimeOriginal: capture.local,
      ...(capture.offset !== undefined && { OffsetTimeOriginal: capture.offset }),
    },
    IFD3: {
      GPSLatitudeRef: capture.lat < 0 ? 'S' : 'N',
      GPSLatitude: dms(capture.lat),
      GPSLongitudeRef: capture.lng < 0 ? 'W' : 'E',
      GPSLongitude: dms(capture.lng),
    },
  };
}

/** Decimal degrees → EXIF's three rationals (degrees, minutes, seconds). */
function dms(value: number): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = Math.floor((absolute - degrees) * 60);
  const seconds = ((absolute - degrees) * 60 - minutes) * 60;
  return `${degrees}/1 ${minutes}/1 ${Math.round(seconds * 10_000)}/10000`;
}

/** What a decoder sees in a buffer: format, dimensions, and any metadata left in it. */
export async function inspect(image: Buffer) {
  const metadata = await sharp(image).metadata();
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    exif: metadata.exif,
    icc: metadata.icc,
    xmp: metadata.xmp,
    iptc: metadata.iptc,
    orientation: metadata.orientation,
  };
}
