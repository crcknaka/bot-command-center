import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readFile } from 'fs/promises';
import { requireAuth } from '../auth/middleware.js';
import { saveUpload, uploadPath, MAX_UPLOAD_BYTES } from '../services/uploads.js';

const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// POST /api/uploads — image for a post (multipart field "file")
const uploadsApi = new Hono();
uploadsApi.post(
  '/',
  requireAuth,
  bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: (c) => c.json({ error: 'Файл больше 10 МБ' }, 413) }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: 'Файл не передан' }, 400);
    try {
      return c.json({ url: saveUpload(Buffer.from(await file.arrayBuffer())) }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  },
);

// GET /uploads/:name — public by design: <img> tags cannot send the session token.
// Names are 128-bit random, and only files saved by saveUpload match the pattern.
const uploadsPublic = new Hono();
uploadsPublic.get('/:name', async (c) => {
  const path = uploadPath(`/uploads/${c.req.param('name')}`);
  if (!path) return c.notFound();
  try {
    const data = await readFile(path);
    return c.body(data, 200, {
      'Content-Type': CONTENT_TYPES[path.split('.').pop()!],
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
  } catch {
    return c.notFound();
  }
});

export { uploadsApi, uploadsPublic };
