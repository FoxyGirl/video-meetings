import fs from 'node:fs';
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

  test('organizer watches status progress to Completed with the transcript, and a non-organizer viewer sees the same', async ({
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

  test('organizer refreshes a completed transcription and a non-organizer never sees the button', async ({
    page,
    request,
    browser,
  }) => {
    // Two full transcription runs share this test's budget (initial upload
    // + the refresh), same generous-timeout reasoning as the spec above.
    test.setTimeout(TRANSCRIPTION_TIMEOUT_MS * 2 + 60_000);

    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await page
      .locator('input[type="file"]')
      .setInputFiles(SHORT_SPEECH_FIXTURE);
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Recording uploaded')).toBeVisible();

    await expect(page.getByText('Completed', { exact: true })).toBeVisible({
      timeout: TRANSCRIPTION_TIMEOUT_MS,
    });
    await expect(page.getByText(/fellow Americans/i)).toBeVisible();

    const refreshButton = page.getByRole('button', {
      name: 'Refresh Transcription',
    });
    await expect(refreshButton).toBeEnabled();

    await refreshButton.click();

    // Reflected straight from the click, before this run's own polling has
    // had a chance to run even once — a deterministic first paint, not a
    // race against real transcription timing (same reasoning as the
    // upload-side "Pending" assertion above).
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();
    await expect(refreshButton).toBeDisabled();

    await expect(page.getByText('Completed', { exact: true })).toBeVisible({
      timeout: TRANSCRIPTION_TIMEOUT_MS,
    });
    await expect(page.getByText(/fellow Americans/i)).toBeVisible();
    await expect(refreshButton).toBeEnabled();

    const viewerEmail = `e2e-refresh-viewer-${Date.now()}@video-meetings.local`;
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
      await expect(
        viewerPage.getByRole('button', { name: 'Refresh Transcription' }),
      ).toHaveCount(0);
    } finally {
      await viewerContext.close();
    }
  });

  // A file that passes the accepted-type check but has no real media
  // content fails fast at ffmpeg's decode step (no actual Whisper
  // inference ever runs), same as
  // apps/api/test/meeting-file-transcription.e2e-spec.ts's own "ends in
  // FAILED" case.
  test('shows a failure indicator, visible to a non-organizer viewer too, when transcription fails', async ({
    page,
    request,
    browser,
  }) => {
    // Playwright's default per-test timeout (30s) wraps the *entire* test
    // body — meeting creation, login, upload, and both waits below all
    // share that budget, not just the explicit `expect` timeouts. The
    // ffmpeg decode failure itself is normally near-instant, but this
    // still needs real headroom under load — same reasoning
    // apps/api/test/meeting-file-transcription.e2e-spec.ts's own
    // 120-attempt/1s-interval poll already applies to this exact scenario.
    test.setTimeout(90_000);

    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'not-real.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('not a real mp4'),
    });
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Recording uploaded')).toBeVisible();

    await expect(page.getByText('Failed', { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('Transcription failed.')).toBeVisible();

    const viewerEmail = `e2e-transcript-failed-viewer-${Date.now()}@video-meetings.local`;
    createdEmails.push(viewerEmail);
    await registerUserViaApi(request, viewerEmail);

    const viewerContext = await browser.newContext();
    try {
      const viewerPage = await viewerContext.newPage();
      await loginViaUi(viewerPage, viewerEmail);
      await viewerPage.goto(`/meetings/${id}`);

      await expect(
        viewerPage.getByText('Failed', { exact: true }),
      ).toBeVisible();
      await expect(viewerPage.getByText('Transcription failed.')).toBeVisible();
    } finally {
      await viewerContext.close();
    }
  });

  test('a completed transcript starts collapsed and expands independently per file', async ({
    page,
    request,
  }) => {
    // Two files transcribing share this test's budget — local Whisper only
    // runs one job at a time, so the second file's run doesn't start until
    // the first finishes (same doubled-budget reasoning as the refresh test
    // above).
    test.setTimeout(TRANSCRIPTION_TIMEOUT_MS * 2 + 60_000);

    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const speechBytes = fs.readFileSync(SHORT_SPEECH_FIXTURE);
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'speech-a.mp3', mimeType: 'audio/mpeg', buffer: speechBytes },
      { name: 'speech-b.mp3', mimeType: 'audio/mpeg', buffer: speechBytes },
    ]);
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('2 recordings uploaded')).toBeVisible();

    await expect(page.getByText('Completed', { exact: true })).toHaveCount(2, {
      timeout: TRANSCRIPTION_TIMEOUT_MS * 2,
    });

    const fileA = page
      .locator('[data-testid^="meeting-file-"]')
      .filter({ hasText: 'speech-a.mp3' });
    const fileB = page
      .locator('[data-testid^="meeting-file-"]')
      .filter({ hasText: 'speech-b.mp3' });

    // Collapsed by default: the transcript text isn't on screen yet, but
    // the toggle to reveal it is.
    await expect(fileA.getByText(/fellow Americans/i)).not.toBeVisible();
    await expect(fileB.getByText(/fellow Americans/i)).not.toBeVisible();
    await expect(
      fileA.getByRole('button', { name: 'Show transcript' }),
    ).toBeVisible();
    await expect(
      fileB.getByRole('button', { name: 'Show transcript' }),
    ).toBeVisible();

    await fileA.getByRole('button', { name: 'Show transcript' }).click();
    await expect(fileA.getByText(/fellow Americans/i)).toBeVisible();
    // Expanding file A's transcript leaves file B collapsed.
    await expect(fileB.getByText(/fellow Americans/i)).not.toBeVisible();

    await fileB.getByRole('button', { name: 'Show transcript' }).click();
    await expect(fileB.getByText(/fellow Americans/i)).toBeVisible();

    // Collapsing file A afterward doesn't affect file B.
    await fileA.getByRole('button', { name: 'Hide transcript' }).click();
    await expect(fileA.getByText(/fellow Americans/i)).not.toBeVisible();
    await expect(fileB.getByText(/fellow Americans/i)).toBeVisible();
  });
});
