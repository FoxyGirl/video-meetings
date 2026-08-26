// Same lazy-getter convention as isTranscriptionEnabled()
// (../transcription/whisper.constants.ts): read process.env at the point of
// use, not baked in at module-load time, so dotenv/config (main.ts) or
// jest-e2e.setup.ts's .env.test load always happens first regardless of
// import order. Gated on GEMINI_API_KEY's mere presence rather than a
// separate on/off flag — there is no meaningful "configured but disabled"
// state for this feature the way TRANSCRIPTION_ENABLED has for local Whisper.
export function isSummaryGenerationEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set.');
  }

  return apiKey;
}

// gemini-2.5-flash (the originally chosen model) was retired for new users
// (confirmed 2026-08-26: every real call returned a 404 "no longer
// available to new users" from the Gemini API itself, which is why every
// generation attempt was silently ending in FAILED). Its suggested
// replacement, a dated gemini-3.6-flash, turned out to have a much
// stricter free-tier quota (20 requests/day) that this app's own testing
// exhausted within a single afternoon. Pinned to the "-latest" alias
// instead — Google maintains this to always resolve to its current
// recommended Flash-class model, so a future retirement rolls forward
// automatically instead of silently breaking every generation again the
// same way. See gemini-api.e2e-spec.ts, the real (non-mocked) e2e test
// that would have caught both of the above immediately.
export const GEMINI_MODEL = 'gemini-flash-latest';
