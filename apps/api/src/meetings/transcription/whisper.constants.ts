import { join } from 'node:path';

// Same lazy-getter convention as getUploadDir() (file-upload.constants.ts):
// read at the point of use, not baked in at module-load time, so
// dotenv/config (main.ts) or jest-e2e.setup.ts's .env.test load always
// happens first regardless of import order.
export function getWhisperModelRootPath(): string {
  return (
    process.env.WHISPER_MODEL_ROOT_PATH ??
    join(process.cwd(), '.whisper-models')
  );
}

// Defaults on (the PRD's automatic-transcription behavior) everywhere
// except apps/api/.env.test, which turns it off for the bulk of the e2e
// suite — every existing upload test uploads synthetic, non-media bytes,
// and would otherwise pay for a doomed transcription attempt on every
// upload call. meeting-file-transcription.e2e-spec.ts re-enables it for
// itself before AppModule is imported.
export function isTranscriptionEnabled(): boolean {
  return process.env.TRANSCRIPTION_ENABLED !== 'false';
}
