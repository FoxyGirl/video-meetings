import path from 'node:path';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  API_URL,
  TEST_USER_EMAIL,
  deleteMeetingById,
  deleteUserByEmail,
  loginUserViaApi,
  registerUserViaApi,
} from './api-helpers';
import { loginViaUi } from './ui-helpers';

// Real speech (public domain, trimmed), not synthetic bytes — the same
// fixture apps/api/test/fixtures uses for its own real-Whisper e2e specs.
// A COMPLETED status needs the local Whisper "tiny" engine to actually
// transcribe something decodable; see apps/web/CLAUDE.md and
// docs/research-transcribe-uploaded-meeting-files-with-local-whisper.md.
const SHORT_SPEECH_FIXTURE = path.join(
  __dirname,
  'fixtures',
  'short-speech.mp3',
);

// Real inference on this short a clip is fast once the model/binary are
// warm (a few seconds), but the very first transcription in a freshly
// provisioned environment additionally pays for nodejs-whisper's one-time
// model download and whisper.cpp CMake build (minutes, not seconds) — see
// the research doc above. A generous timeout absorbs that without every
// other spec in the suite paying for it.
const TRANSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000;

async function createMeeting(
  request: APIRequestContext,
): Promise<{ id: string; title: string }> {
  const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
  const title = `E2E Transcription Meeting ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await request.post(`${API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { title, date: '2026-08-01T15:00:00.000Z', participants: [] },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to create test meeting: ${res.status()} ${await res.text()}`,
    );
  }
  const { id } = (await res.json()) as { id: string };
  return { id, title };
}

test.describe('meeting transcription status and transcript', () => {
  const meetingIds: string[] = [];
  const createdEmails: string[] = [];

  test.beforeAll(async ({ request }) => {
    await registerUserViaApi(request, TEST_USER_EMAIL, {
      ignoreConflict: true,
    });
  });

  test.afterEach(async () => {
    await Promise.all(meetingIds.splice(0).map(deleteMeetingById));
    await Promise.all(createdEmails.splice(0).map(deleteUserByEmail));
  });

  // Tagged @heavy so package.json's test:e2e script can run it in its own
  // always-serial second pass — real, CPU-bound local Whisper inference
  // here would otherwise starve other concurrently-running specs' timing
  // if it ran in the default parallel pass (see playwright.config.ts and
  // apps/web/CLAUDE.md's "Meeting transcription status and transcript"
  // section for the full story).
  test('organizer watches status progress to Completed with the transcript, and a non-organizer viewer sees the same @heavy', async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(TRANSCRIPTION_TIMEOUT_MS + 60_000);

    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await page
      .locator('input[type="file"]')
      .setInputFiles(SHORT_SPEECH_FIXTURE);
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Recording uploaded')).toBeVisible();

    // Seeded straight from the upload response (PENDING), before this
    // component's own polling has had a chance to run even once — this is
    // a deterministic first paint, not a race against real transcription
    // timing.
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();

    // Polls GET /meetings/:id/file (no page reload) until the real local
    // Whisper "tiny" engine finishes.
    await expect(page.getByText('Completed', { exact: true })).toBeVisible({
      timeout: TRANSCRIPTION_TIMEOUT_MS,
    });
    await expect(page.getByText(/fellow Americans/i)).toBeVisible();

    const viewerEmail = `e2e-transcript-viewer-${Date.now()}@video-meetings.local`;
    createdEmails.push(viewerEmail);
    await registerUserViaApi(request, viewerEmail);

    const viewerContext = await browser.newContext();
    try {
      const viewerPage = await viewerContext.newPage();
      await loginViaUi(viewerPage, viewerEmail);
      await viewerPage.goto(`/meetings/${id}`);

      await expect(
        viewerPage.getByText('Completed', { exact: true }),
      ).toBeVisible();
      await expect(viewerPage.getByText(/fellow Americans/i)).toBeVisible();
    } finally {
      await viewerContext.close();
    }
  });
});
