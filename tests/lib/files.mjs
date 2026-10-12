// Upload samples: real images from tests/fixtures (make-fixtures.mjs) and small hostile files.
import fs from 'node:fs';
import path from 'node:path';
import { TESTS_DIR } from './paths.mjs';

const fixture = (name) => fs.readFileSync(path.join(TESTS_DIR, 'fixtures', name));
const pad = (bytes, size = 64) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(Math.max(0, size - bytes.length), 0x20)]);

export const JPG = fixture('photo.jpg');
export const PNG = fixture('photo.png');
export const WEBP = fixture('photo.webp');
export const JPG_WITH_EXIF = fixture('photo-with-exif.jpg');
export const EXIF_SECRET = fs.readFileSync(path.join(TESTS_DIR, 'fixtures', 'exif-secret.txt'), 'utf8');

// An ISO-BMFF ("ftyp") header is what the server recognises as MP4; the fake Cloudinary accepts it.
export const MP4 = pad([0x00, 0x00, 0x00, 0x18, ...Buffer.from('ftypisom'), 0x00, 0x00, 0x02, 0x00, ...Buffer.from('isomiso2mp41')], 2048);
export const EXE = pad([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00], 512);
export const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
export const HTML = Buffer.from('<!doctype html><script>alert(document.cookie)</script>'.repeat(4));
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
export const PDF_JS = Buffer.from('%PDF-1.4\n2 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj\n%%EOF\n');
export const PDF_LAUNCH = Buffer.from('%PDF-1.4\n2 0 obj << /S /Launch /F (cmd.exe) >> endobj\n%%EOF\n');

/** { bytes, type, name } entries for upload(). */
export const file = (bytes, type, name) => ({ bytes, type, name });
export const jpg = (name = 'photo.jpg') => file(JPG, 'image/jpeg', name);
export const png = (name = 'photo.png') => file(PNG, 'image/png', name);
export const webp = (name = 'photo.webp') => file(WEBP, 'image/webp', name);
export const big = (megabytes, type = 'image/jpeg', name = 'huge.jpg') => file(Buffer.concat([JPG, Buffer.alloc(megabytes * 1024 * 1024)]), type, name);
