import fs from 'node:fs/promises';

const HEADER_BYTES = 64;

// Magic bytes at the start of each format. The client's filename and Content-Type are both
// easy to fake; the file's own first bytes are not.
const SIGNATURES = [
  { mimeType: 'image/jpeg', matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  {
    mimeType: 'image/png',
    matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/webp',
    matches: (bytes) => bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP',
  },
  { mimeType: 'image/gif', matches: (bytes) => ['GIF87a', 'GIF89a'].includes(bytes.toString('latin1', 0, 6)) },
  { mimeType: 'application/pdf', matches: (bytes) => bytes.toString('latin1', 0, 5) === '%PDF-' },
  // ISO base media ("ftyp" box). QuickTime (.mov) shares the container, so its "qt  " brand is excluded.
  {
    mimeType: 'video/mp4',
    matches: (bytes) => bytes.toString('latin1', 4, 8) === 'ftyp' && bytes.toString('latin1', 8, 12) !== 'qt  ',
  },
  // EBML header whose DocType is "webm" (Matroska .mkv files share the header but say "matroska").
  {
    mimeType: 'video/webm',
    matches: (bytes) =>
      bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && bytes.includes(Buffer.from('webm', 'latin1')),
  },
];

/** Returns the real MIME type of an image, video or PDF on disk, or null if it isn't a known format. */
export async function detectMediaType(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const bytes = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead < 12) return null;
    return SIGNATURES.find((signature) => signature.matches(bytes.subarray(0, bytesRead)))?.mimeType ?? null;
  } finally {
    await handle.close();
  }
}
