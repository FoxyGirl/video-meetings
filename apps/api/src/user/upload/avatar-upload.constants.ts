import { join } from 'node:path';

// Unlike meetings' getUploadDir(), a plain top-level const is fine here: the
// only consumer needing it before dotenv has loaded would be a module
// required earlier than main.ts's first `import 'dotenv/config'` line (or,
// in e2e tests, earlier than jest-e2e.setup.ts's .env.test load) — neither
// happens in this codebase's import graph today.
export const AVATAR_UPLOAD_DIR =
  process.env.AVATAR_UPLOAD_DIR ?? join(process.cwd(), 'uploads', 'avatars');

// Same static-at-import-time constraint as MAX_UPLOAD_FILE_SIZE_BYTES:
// multer's `limits.fileSize` is read once, at Multer-instance construction
// time, with no supported way to defer it to request time.
export const MAX_AVATAR_FILE_SIZE_BYTES =
  Number(process.env.MAX_AVATAR_FILE_SIZE_BYTES) || 5 * 1024 * 1024;

// Extension -> declared MIME type. Mirrored in apps/web's client-side
// validation — keep both tables identical if either changes.
export const ACCEPTED_AVATAR_TYPES: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
