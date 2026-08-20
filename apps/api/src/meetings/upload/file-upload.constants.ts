import { resolve } from 'node:path';

// A function, not a top-level const: every consumer calls this at the point
// it actually needs the path (module init, per-request, per-upload) rather
// than baking in whatever process.env looked like when this file happened
// to be require()'d. Same footgun apps/api/CLAUDE.md documents for
// JWT_SECRET, solved there via JwtModule.registerAsync's deferred read.
//
// Always resolved to an absolute path (UPLOAD_DIR itself may be relative,
// as apps/api/.env.test's does) — the local Whisper transcription engine
// (src/meetings/transcription/) shells out to whisper-cli via a library
// that changes this whole process's cwd for the duration of that call, so
// a relative path computed from this function anywhere else in the app
// could otherwise resolve against the wrong directory if it raced against
// a concurrent transcription job.
export function getUploadDir(): string {
  return resolve(process.env.UPLOAD_DIR ?? 'uploads');
}

// Unlike UPLOAD_DIR, this can't be made lazy the same way: multer's
// `limits.fileSize` must be a static value at Multer-instance construction
// time (busboy reads it once, inside FileInterceptor's decorator — i.e. at
// meetings.controller.ts's module-load time), with no supported way to
// defer it to request time short of a custom interceptor. In practice this
// is safe today: main.ts's `import 'dotenv/config'` is the first line
// (so it runs before AppModule's require graph reaches this file), and in
// e2e tests jest-e2e.setup.ts's setupFiles loads .env.test before any test
// file — and therefore any module in this import graph — is required.
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
