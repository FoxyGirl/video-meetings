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
//
// The no-UPLOAD_DIR fallback is resolved once here, at module load — still
// well before dotenv/config or any transcription job could possibly run —
// rather than inside getUploadDir() itself: resolving a relative default
// against process.cwd() *at call time* would reopen the same
// wrong-directory race for exactly the one case (UPLOAD_DIR unset, this
// repo's own documented default) the absolute-path fix above exists to
// close, since a concurrent transcription job can hold cwd changed for as
// long as its own inference call takes.
const DEFAULT_UPLOAD_DIR = resolve('uploads');

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR
    ? resolve(process.env.UPLOAD_DIR)
    : DEFAULT_UPLOAD_DIR;
}

// Unlike UPLOAD_DIR, this can't be made lazy the same way: multer's
// `limits.fileSize` must be a static value at Multer-instance construction
// time (busboy reads it once, inside FilesInterceptor's decorator — i.e. at
// meetings.controller.ts's module-load time), with no supported way to
// defer it to request time short of a custom interceptor. In practice this
// is safe today: main.ts's `import 'dotenv/config'` is the first line
// (so it runs before AppModule's require graph reaches this file), and in
// e2e tests jest-e2e.setup.ts's setupFiles loads .env.test before any test
// file — and therefore any module in this import graph — is required.
export const MAX_UPLOAD_FILE_SIZE_BYTES =
  Number(process.env.MAX_UPLOAD_FILE_SIZE_BYTES) || 500 * 1024 * 1024;

// Multer/busboy's own limits.fileSize can't be made batch-tolerant the way
// validateFileType is: once a file's streamed bytes exceed it, Multer aborts
// the *entire* multipart request immediately (there's no equivalent of
// fileFilter's callback(null, false) for a mid-stream size violation), so it
// can never reject just the one oversized file while letting the rest of a
// batch through. Setting it to MAX_UPLOAD_FILE_SIZE_BYTES itself would mean
// any single oversized file in a batch fails every other (valid) file in the
// same request too — the PRD's "wrong type/too large" mixed-batch scenario
// requires the too-large file to be reported individually instead. This
// constant is deliberately looser: a generous multiple of the real per-file
// limit, so a moderately-oversized file (the realistic, tested case) still
// completes streaming to disk and reaches UploadMeetingFileHandler's own
// authoritative per-file size check (batch-tolerant, same as
// validateFileType) instead of aborting the whole request — only a truly
// extreme single file trips this ceiling, which is an acceptable DoS
// backstop to fail the whole request over.
export const MULTER_FILE_SIZE_HARD_LIMIT_BYTES = MAX_UPLOAD_FILE_SIZE_BYTES * 4;

// Fixed for this iteration, not configurable per environment — see the PRD's
// "Non-goals". Enforced authoritatively in UploadMeetingFileHandler (an
// existing-count + incoming-batch check inside the same locked transaction
// as the organizer check) and as FilesInterceptor's maxCount, since a single
// request can never legitimately need more files than the cap allows.
export const MAX_FILES_PER_MEETING = 10;

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
