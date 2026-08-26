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

// A current free-tier Flash-class model — more than capable of a
// single-shot summarize-and-extract task like this one (see
// docs/research-meeting-summary-action-items-and-decisions.md).
// gemini-2.5-flash was retired for new users (confirmed 2026-08-26: every
// real call returned a 404 "no longer available to new users" from the
// Gemini API itself, which is why every generation attempt was silently
// ending in FAILED) — Google's own error pointed at this replacement.
export const GEMINI_MODEL = 'gemini-3.6-flash';
