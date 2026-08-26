import { describe, it, expect } from '@jest/globals';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Makes a real call to the Anthropic API, so it's skipped without a real key
// rather than failing pre-push/CI for anyone who hasn't set one locally —
// same opt-in-by-env-var pattern as TRANSCRIPTION_ENABLED (see
// apps/api/src/meetings/transcription/whisper.constants.ts).
const describeIfApiKeyPresent = process.env.ANTHROPIC_API_KEY
  ? describe
  : describe.skip;

describeIfApiKeyPresent('Agent SDK (e2e)', () => {
  // it needs additional money
  it.skip('gets a real response back from Claude via the Agent SDK', async () => {
    let result: string | undefined;

    for await (const message of query({
      prompt: 'Reply with exactly: pong',
      options: { maxTurns: 1, allowedTools: [] },
    })) {
      if (message.type !== 'result') continue;
      expect(message.subtype).toBe('success');
      if (message.subtype === 'success') result = message.result;
      break;
    }

    expect(result?.toLowerCase()).toContain('pong');
  }, 30000);
});
