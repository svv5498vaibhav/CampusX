import fs from 'node:fs/promises';

/*
 * Removes metadata from JPEG, PNG and WEBP files before they are uploaded: EXIF (camera, time, GPS
 * location), XMP, IPTC, comments and text chunks, plus extra images some phones append to a JPEG.
 * Only a JPEG's orientation is kept, so photos still display the right way up. The image data itself
 * is copied unchanged (nothing is re-encoded). A file whose structure can't be followed is refused
 * rather than uploaded with its metadata.
 */

export class ImageMetadataError extends Error {}
const fail = () => {
  throw new ImageMetadataError('Unreadable image structure');
};

// ----------------------------------------------------------------------------- JPEG

const TIFF_ORIENTATION = 0x0112;

/** The orientation (1-8) from an EXIF payload ("Exif\0\0" + TIFF), or null. */
function readOrientation(payload) {
  if (payload.length < 14 || payload.toString('latin1', 0, 6) !== 'Exif\0\0') return null;
  const tiff = payload.subarray(6);
  const little = tiff.toString('latin1', 0, 2) === 'II';
  if (!little && tiff.toString('latin1', 0, 2) !== 'MM') return null;
  const u16 = (offset) => (little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset));
  const u32 = (offset) => (little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const entries = u16(ifd);
  for (let n = 0; n < entries; n += 1) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === TIFF_ORIENTATION) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** A minimal APP1 segment holding only the orientation tag. */
function orientationSegment(orientation) {
  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 right after the header
  tiff.writeUInt16LE(1, 8); // one entry
  tiff.writeUInt16LE(TIFF_ORIENTATION, 10);
  tiff.writeUInt16LE(3, 12); // SHORT
  tiff.writeUInt32LE(1, 14); // count
  tiff.writeUInt16LE(orientation, 18);
  // bytes 20-21 padding, 22-25 next IFD = 0
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

function stripJpeg(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) fail();
  const kept = [];
  let orientation = null;
  let i = 2;
  let imageData = null;
  while (i < buffer.length) {
    if (buffer[i] !== 0xff) fail();
    const marker = buffer[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: the image data runs to the first end-of-image marker (entropy-coded data never
      // contains FF D9). Anything after it (e.g. appended preview images) is dropped.
      const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), i);
      if (end === -1) fail();
      imageData = buffer.subarray(i, end + 2);
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push(buffer.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buffer.length) fail();
    const length = buffer.readUInt16BE(i + 2);
    if (length < 2 || i + 2 + length > buffer.length) fail();
    const segment = buffer.subarray(i, i + 2 + length);
    const payload = segment.subarray(4);
    if (marker === 0xe1) {
      orientation ??= readOrientation(payload); // EXIF / XMP: dropped, orientation remembered
    } else if (marker === 0xe2 && payload.toString('latin1', 0, 12) !== 'ICC_PROFILE\0') {
      // APP2 other than the colour profile (e.g. multi-picture data): dropped
    } else if (marker !== 0xed && marker !== 0xfe && !(marker >= 0xe3 && marker <= 0xec)) {
      // Everything except IPTC (APP13), comments and vendor APP3-APP12 is kept: JFIF, quantisation and
      // Huffman tables, frame headers, the colour profile, Adobe APP14.
      kept.push(segment);
    }
    i += 2 + length;
  }
  if (!imageData) fail();
  if (orientation && orientation !== 1) {
    const afterJfif = kept[0]?.[1] === 0xe0 ? 1 : 0;
    kept.splice(afterJfif, 0, orientationSegment(orientation));
  }
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...kept, imageData]);
}

// ----------------------------------------------------------------------------- PNG

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) fail();
  const kept = [PNG_SIGNATURE];
  let i = 8;
  while (i < buffer.length) {
    if (i + 12 > buffer.length) fail();
    const length = buffer.readUInt32BE(i);
    const type = buffer.toString('latin1', i + 4, i + 8);
    const end = i + 12 + length;
    if (end > buffer.length) fail();
    if (!PNG_METADATA.has(type)) kept.push(buffer.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(kept);
  }
  return fail();
}

// ----------------------------------------------------------------------------- WEBP

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function stripWebp(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') fail();
  const end = Math.min(buffer.length, 8 + buffer.readUInt32LE(4));
  const kept = [];
  let i = 12;
  while (i + 8 <= end) {
    const type = buffer.toString('latin1', i, i + 4);
    const size = buffer.readUInt32LE(i + 4);
    const next = i + 8 + size + (size % 2);
    if (i + 8 + size > end) fail();
    if (type === 'VP8X') {
      const chunk = Buffer.from(buffer.subarray(i, Math.min(next, end)));
      chunk[8] &= ~(VP8X_EXIF | VP8X_XMP);
      kept.push(chunk);
    } else if (type !== 'EXIF' && type !== 'XMP ') {
      kept.push(buffer.subarray(i, Math.min(next, end)));
    }
    i = next;
  }
  const body = Buffer.concat(kept);
  const header = Buffer.from('RIFF0000WEBP', 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

// ----------------------------------------------------------------------------- entry point

const STRIPPERS = { 'image/jpeg': stripJpeg, 'image/png': stripPng, 'image/webp': stripWebp };

/** Rewrites the file without its metadata. `mimeType` is the type detected from the file's contents. */
export async function stripImageMetadata(filePath, mimeType) {
  const strip = STRIPPERS[mimeType];
  if (!strip) throw new ImageMetadataError(`Unsupported image type: ${mimeType}`);
  const original = await fs.readFile(filePath);
  await fs.writeFile(filePath, strip(original));
}
