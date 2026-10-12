// A local stand-in for Cloudinary's upload API, so upload success paths can be tested without real
// credentials. Test backends point the official SDK at it through
//   CLOUDINARY_URL=cloudinary://key:secret@cloud?upload_prefix=http://127.0.0.1:<port>
// It answers what the SDK calls (upload, chunked upload_large, destroy) and records every call:
//   GET /__uploads → [{ publicId, resourceType, folder, bytes, format }]   GET /__destroyed → [publicId]
//   POST /__fail?count=n → the next n uploads answer HTTP 500 (to test failure handling)
// It never stores file contents.
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { BACKEND } from './paths.mjs';

const Busboy = createRequire(path.join(BACKEND, 'package.json'))('busboy');

export const FAKE_CLOUD = 'campusx-test';
export const cloudinaryEnv = (port) => ({
  CLOUDINARY_CLOUD_NAME: FAKE_CLOUD,
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'fake-cloudinary-secret-for-tests',
  CLOUDINARY_URL: `cloudinary://123456789012345:fake-cloudinary-secret-for-tests@${FAKE_CLOUD}?upload_prefix=http://127.0.0.1:${port}`,
});

const FORMAT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'application/pdf': 'pdf' };

export async function startFakeCloudinary(port) {
  const uploads = [];
  const destroyed = [];
  let failNext = 0;
  let succeedFirst = 0;

  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method === 'GET' && url.pathname === '/__uploads') return send(200, uploads);
    if (req.method === 'GET' && url.pathname === '/__destroyed') return send(200, destroyed);
    if (req.method === 'POST' && url.pathname === '/__fail') {
      failNext = Number(url.searchParams.get('count') ?? 1);
      succeedFirst = Number(url.searchParams.get('after') ?? 0);
      return send(200, { failNext, succeedFirst });
    }
    const match = /^\/v1_1\/([^/]+)\/(image|video|raw)\/(upload|destroy)$/.exec(url.pathname);
    if (req.method !== 'POST' || !match) return send(404, { error: { message: 'Not found' } });
    const [, cloud, resourceType, action] = match;

    const fields = {};
    let bytes = 0;
    let fileType = null;
    let fileName = null;
    const chunks = [];
    const busboy = Busboy({ headers: req.headers });
    busboy.on('field', (name, value) => {
      fields[name] = value;
    });
    busboy.on('file', (name, stream, info) => {
      fileType = info.mimeType;
      fileName = info.filename;
      stream.on('data', (chunk) => {
        bytes += chunk.length;
        // Small files are kept (base64) so tests can check what really left the server (e.g. no EXIF).
        if (bytes <= 256 * 1024) chunks.push(chunk);
      });
    });
    busboy.on('close', () => {
      if (action === 'destroy') {
        destroyed.push(fields.public_id);
        return send(200, { result: 'ok' });
      }
      if (failNext > 0 && succeedFirst > 0) {
        succeedFirst -= 1;
      } else if (failNext > 0) {
        failNext -= 1;
        return send(500, { error: { message: 'Simulated Cloudinary failure' } });
      }
      // Chunked uploads (upload_large): only the last chunk gets the full answer the SDK returns.
      const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers['content-range'] ?? '');
      const publicId = `${fields.folder ? `${fields.folder}/` : ''}${crypto.randomBytes(10).toString('hex')}`;
      const extension = path.extname(fileName ?? '').slice(1).toLowerCase();
      const format = FORMAT_BY_TYPE[fileType] ?? (extension || (resourceType === 'raw' ? 'pdf' : 'jpg'));
      const version = Math.floor(Date.now() / 1000);
      const record = { publicId, resourceType, folder: fields.folder ?? null, bytes: range ? Number(range[3]) : bytes, format, cloud, ...(bytes <= 256 * 1024 && { content: Buffer.concat(chunks).toString('base64') }) };
      if (!range || Number(range[2]) + 1 === Number(range[3])) uploads.push(record);
      return send(200, {
        public_id: publicId,
        version,
        resource_type: resourceType,
        format,
        width: resourceType === 'raw' ? undefined : 800,
        height: resourceType === 'raw' ? undefined : 600,
        bytes: record.bytes,
        duration: resourceType === 'video' ? 4.2 : undefined,
        secure_url: `https://res.cloudinary.com/${cloud}/${resourceType}/upload/v${version}/${publicId}.${format}`,
        url: `http://res.cloudinary.com/${cloud}/${resourceType}/upload/v${version}/${publicId}.${format}`,
      });
    });
    req.pipe(busboy);
    return undefined;
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    port,
    env: cloudinaryEnv(port),
    uploads,
    destroyed,
    /** The next `count` uploads fail (HTTP 500), after letting `after` uploads succeed first. */
    failNext: (count = 1, after = 0) => {
      failNext = count;
      succeedFirst = after;
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
