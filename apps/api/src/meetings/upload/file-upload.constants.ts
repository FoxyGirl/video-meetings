import { join } from 'node:path';

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

export const MAX_UPLOAD_FILE_SIZE_BYTES =
  Number(process.env.MAX_UPLOAD_FILE_SIZE_BYTES) || 500 * 1024 * 1024;

// Extension -> declared MIME type. Mirrored in apps/web's client-side
// validation (Phase 5) — keep both tables identical if either changes.
export const ACCEPTED_FILE_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};
