// Regenerates the small image fixtures the suites upload (real, decodable files drawn and encoded by
// the browser), plus a JPEG carrying EXIF (camera + GPS text) for the Anonymous Zone metadata checks.
//   node tests/fixtures/make-fixtures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser, loadPlaywright } from '../lib/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const playwright = await loadPlaywright();
if (!playwright) throw new Error('playwright-core is needed to draw the fixtures (see tests/README.md)');
const browser = await playwright.chromium.launch({ executablePath: findBrowser() });
const page = await browser.newPage();
const encoded = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#1f7a4d';
  g.fillRect(0, 0, 96, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(12, 12, 40, 28);
  g.fillStyle = '#f2c94c';
  g.beginPath();
  g.arc(70, 36, 14, 0, Math.PI * 2);
  g.fill();
  return {
    jpg: canvas.toDataURL('image/jpeg', 0.9),
    png: canvas.toDataURL('image/png'),
    webp: canvas.toDataURL('image/webp', 0.9),
  };
});
await browser.close();

const decode = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
const files = { 'photo.jpg': decode(encoded.jpg), 'photo.png': decode(encoded.png), 'photo.webp': decode(encoded.webp) };

// EXIF APP1 right after SOI: a TIFF header with one ASCII tag (ImageDescription) holding camera and
// GPS-looking text the server must strip before anything is uploaded.
const secret = 'Pixel 9 Pro GPS 21.1458N 79.0882E';
const text = Buffer.from(`${secret}\0`, 'latin1');
const tiff = Buffer.alloc(8 + 2 + 12 + 4);
tiff.write('II', 0, 'latin1');
tiff.writeUInt16LE(42, 2);
tiff.writeUInt32LE(8, 4);
tiff.writeUInt16LE(1, 8);
tiff.writeUInt16LE(0x010e, 10); // ImageDescription
tiff.writeUInt16LE(2, 12); // ASCII
tiff.writeUInt32LE(text.length, 14);
tiff.writeUInt32LE(tiff.length, 18); // value right after the IFD
const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, text]);
const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
const jpg = files['photo.jpg'];
files['photo-with-exif.jpg'] = Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]);

for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(HERE, name), bytes);
fs.writeFileSync(path.join(HERE, 'exif-secret.txt'), secret);
console.log(Object.entries(files).map(([name, bytes]) => `${name} ${bytes.length} B`).join('\n'));
