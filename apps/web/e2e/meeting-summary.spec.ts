import path from 'node:path';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  API_URL,
  TEST_USER_EMAIL,
  deleteMeetingById,
  deleteUserByEmail,
  loginUserViaApi,
  registerUserViaApi,
  seedMeetingFile,
  seedMeetingSummary,
} from './api-helpers';
import { loginViaUi } from './ui-helpers';

// Synthetic bytes, same fixture meeting-file-upload.spec.ts uses for its own
// upload-flow tests — fine here too, since this test only cares that the
// summary card appears once a file exists, not that transcription succeeds.
const VALID_FIXTURE = path.join(__dirname, 'fixtures', 'test-recording.mp3');

async function createMeeting(
  request: APIRequestContext,
): Promise<{ id: string; title: string }> {
  const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
  const title = `E2E Summary Meeting ${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

test.describe('meeting summary, action items, and decisions', () => {
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

  test('renders a completed summary, action items with assignees, and decisions', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await seedMeetingFile(id, 'COMPLETED');
    await seedMeetingSummary(id, {
      status: 'COMPLETED',
      text: 'The team reviewed Q3 targets and agreed on next steps.',
      actionItems: [
        { description: 'Follow up with the client', assignee: 'Alice' },
        { description: 'Draft the updated proposal' },
      ],
      decisions: [{ description: 'Adopt the new pricing plan' }],
    });

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const summary = page.getByTestId('meeting-summary');
    await expect(summary.getByText('Completed', { exact: true })).toBeVisible();
    await expect(
      summary.getByText(
        'The team reviewed Q3 targets and agreed on next steps.',
      ),
    ).toBeVisible();
    await expect(summary.getByText('Follow up with the client')).toBeVisible();
    await expect(summary.getByText('Alice', { exact: false })).toBeVisible();
    await expect(summary.getByText('Draft the updated proposal')).toBeVisible();
    await expect(summary.getByText('Adopt the new pricing plan')).toBeVisible();
  });

  test('shows a partial-input notice when the summary is based on partial transcripts', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await seedMeetingFile(id, 'COMPLETED');
    await seedMeetingFile(id, 'FAILED');
    await seedMeetingSummary(id, {
      status: 'COMPLETED',
      text: 'Partial summary from the one file that transcribed.',
      isPartial: true,
    });

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const summary = page.getByTestId('meeting-summary');
    await expect(
      summary.getByText(
        'Based on partial input — one or more recordings could not be transcribed.',
      ),
    ).toBeVisible();
  });

  test('renders empty action-item and decision lists as an explicit none-found state', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await seedMeetingFile(id, 'COMPLETED');
    await seedMeetingSummary(id, {
      status: 'COMPLETED',
      text: 'Nothing actionable came out of this meeting.',
      actionItems: [],
      decisions: [],
    });

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const summary = page.getByTestId('meeting-summary');
    await expect(summary.getByText('No action items found.')).toBeVisible();
    await expect(summary.getByText('No decisions found.')).toBeVisible();
  });

  test("the summary card appears after uploading the meeting's first file, with no reload", async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    // A meeting with zero files renders no summary card at all — this is
    // what regressed: MeetingSummary used to mount right here (seeded from
    // an empty files list) and then get permanently stuck, since it never
    // re-synced to the page's own files state after the upload below and
    // its own polling never started for an empty file set. It must not
    // mount until there's a file to seed it correctly.
    await expect(page.getByText('Meeting Summary')).not.toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(VALID_FIXTURE);
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Recording uploaded')).toBeVisible();

    // No page.reload() anywhere in this test — the card has to show up on
    // its own once the file exists.
    const summary = page.getByTestId('meeting-summary');
    await expect(summary.getByText('Meeting Summary')).toBeVisible();
  });

  test('shows a not-yet-available state while a file is still transcribing', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await seedMeetingFile(id, 'PROCESSING');

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const summary = page.getByTestId('meeting-summary');
    await expect(
      summary.getByText(
        'Summary not yet available — recordings are still being transcribed.',
      ),
    ).toBeVisible();
  });

  test('explains that no summary is available when every file failed transcription', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await seedMeetingFile(id, 'FAILED');

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const summary = page.getByTestId('meeting-summary');
    await expect(
      summary.getByText(
        'No summary is available — every recording failed transcription.',
      ),
    ).toBeVisible();
  });

  test('organizer can refresh a completed summary, discarding its current contents, and a non-organizer never sees the button', async ({
    page,
    request,
    browser,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await seedMeetingFile(id, 'COMPLETED');
    await seedMeetingSummary(id, {
      status: 'COMPLETED',
      text: 'This summary should be discarded by the refresh below.',
      actionItems: [{ description: 'A stale action item' }],
      decisions: [{ description: 'A stale decision' }],
    });

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const summary = page.getByTestId('meeting-summary');
    await expect(
      summary.getByText(
        'This summary should be discarded by the refresh below.',
      ),
    ).toBeVisible();

    const refreshButton = summary.getByRole('button', {
      name: 'Refresh Summary',
    });
    await expect(refreshButton).toBeEnabled();
    await refreshButton.click();

    // RefreshMeetingSummaryHandler always discards the current summary
    // synchronously (clearMeetingSummary()) before this request resolves,
    // regardless of whether a fresh run actually starts afterward (that
    // depends on GEMINI_API_KEY being configured, which this dev
    // environment intentionally leaves unset — see apps/api/CLAUDE.md) — so
    // the previously-shown content going away is the one outcome this test
    // can assert deterministically either way.
    await expect(
      summary.getByText(
        'This summary should be discarded by the refresh below.',
      ),
    ).not.toBeVisible();
    await expect(summary.getByText('A stale action item')).not.toBeVisible();
    await expect(summary.getByText('A stale decision')).not.toBeVisible();

    const viewerEmail = `e2e-summary-viewer-${Date.now()}@video-meetings.local`;
    createdEmails.push(viewerEmail);
    await registerUserViaApi(request, viewerEmail);

    const viewerContext = await browser.newContext();
    try {
      const viewerPage = await viewerContext.newPage();
      await loginViaUi(viewerPage, viewerEmail);
      await viewerPage.goto(`/meetings/${id}`);

      await expect(
        viewerPage
          .getByTestId('meeting-summary')
          .getByRole('button', { name: 'Refresh Summary' }),
      ).toHaveCount(0);
    } finally {
      await viewerContext.close();
    }
  });
});
