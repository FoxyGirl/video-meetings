import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { describe, it, expect } from '@jest/globals';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_MODEL } from '../src/meetings/summary/summary.constants';

// Reads .env directly rather than trusting process.env.GEMINI_API_KEY: this
// suite runs --runInBand (one shared process for every e2e spec file), and
// both meeting-summary-generation.e2e-spec.ts and
// meeting-summary-refresh.e2e-spec.ts unconditionally overwrite
// process.env.GEMINI_API_KEY with a dummy 'test-key' at module load time (so
// their own mocked-LLM tests can get past isSummaryGenerationEnabled()'s
// gate). Jest's default test sequencer doesn't run spec files in a fixed
// order (it reorders around cache/failure/size heuristics), so whichever of
// those two files happens to run before this one would otherwise poison
// this test — either skipping a real key that IS configured, or worse,
// attempting a real network call against the literal string 'test-key'.
// Reading .env's own on-disk value sidesteps that entirely, independent of
// file execution order. .env is gitignored/dev-only (same as
// ANTHROPIC_API_KEY, see jest-e2e.setup.ts) — this resolves to undefined in
// CI, where the file doesn't exist.
function readRealGeminiApiKey(): string | undefined {
  try {
    const envFile = readFileSync(resolve(__dirname, '../.env'), 'utf8');
    return parse(envFile).GEMINI_API_KEY;
  } catch {
    return undefined;
  }
}

const REAL_GEMINI_API_KEY = readRealGeminiApiKey();

// Makes a real call to the Gemini API, so it's skipped without a real key
// configured in .env rather than failing pre-push/CI for anyone who hasn't
// set one locally — same opt-in-by-env-var pattern as TRANSCRIPTION_ENABLED
// and agent-sdk.e2e-spec.ts's own ANTHROPIC_API_KEY gate. Unlike that spec's
// Anthropic call, this one isn't it.skip'd even when the key is present —
// Gemini's free tier is genuinely $0 (see
// docs/research-meeting-summary-action-items-and-decisions.md), so there's
// no "needs additional money" reason to skip it by default.
const describeIfApiKeyPresent = REAL_GEMINI_API_KEY ? describe : describe.skip;

// Transient, not a real problem — Google's own error carries a
// retryDelay for both of these, i.e. it expects well-behaved clients to
// retry. Observed twice in one afternoon of local testing (a 503
// "experiencing high demand" and, separately, a 429 immediately after a
// prior real call). Anything else (404 model-not-found, 401/403 auth,
// PERMISSION_DENIED) is exactly the kind of persistent failure this test
// exists to catch, and fails immediately rather than burning the retry
// budget masking it.
const RETRYABLE_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

async function pingGeminiWithRetries(
  ai: GoogleGenAI,
): Promise<string | undefined> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: 'Reply with exactly: pong',
      });
      return response.text;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (
        attempt === MAX_ATTEMPTS ||
        !status ||
        !RETRYABLE_STATUSES.has(status)
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  // Unreachable — the loop above always either returns or throws.
  throw new Error('unreachable');
}

describeIfApiKeyPresent('Gemini API (e2e)', () => {
  // Deliberately calls the SDK directly against GEMINI_MODEL rather than
  // through generateMeetingSummary() (already covered, with the LLM call
  // mocked, by meeting-summary-generation.e2e-spec.ts) — the point of this
  // test is to catch the model/API itself breaking (a retired model name,
  // an expired/revoked key, an API-side outage), which a mocked test can
  // never catch. This is exactly what silently broke summary generation
  // before: gemini-2.5-flash was retired for new users, every real call
  // started returning a 404, and GenerateMeetingSummaryHandler's catch
  // block turned that into a routine-looking FAILED with nothing anywhere
  // in the test suite ever calling the real API to notice.
  it('gets a real response back from the configured Gemini model', async () => {
    const ai = new GoogleGenAI({ apiKey: REAL_GEMINI_API_KEY! });

    const text = await pingGeminiWithRetries(ai);

    expect(text?.toLowerCase()).toContain('pong');
  }, 60000);
});
