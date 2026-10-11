import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

export const UPLOAD_DIR = resolve(process.cwd(), 'data', 'uploads');
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // Telegram's own photo limit

const UPLOAD_URL_RE = /^\/uploads\/([a-f0-9]{32}\.(?:jpg|png|webp|gif))$/;

/** Image type by file signature — the browser-supplied type and name are not trusted */
function detectExt(buf: Buffer): 'jpg' | 'png' | 'webp' | 'gif' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** Store an uploaded image under a random name; returns its /uploads/... URL */
export function saveUpload(buf: Buffer): string {
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error('Файл больше 10 МБ');
  const ext = detectExt(buf);
  if (!ext) throw new Error('Поддерживаются только картинки JPG, PNG, WEBP и GIF');
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${randomBytes(16).toString('hex')}.${ext}`;
  writeFileSync(resolve(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

/** File name of an uploaded image, or null when the URL is not one of ours */
export function uploadName(url: string | null | undefined): string | null {
  return url?.match(UPLOAD_URL_RE)?.[1] ?? null;
}

/** Disk path of an uploaded image, or null for external URLs */
export function uploadPath(url: string | null | undefined): string | null {
  const name = uploadName(url);
  return name ? resolve(UPLOAD_DIR, name) : null;
}
