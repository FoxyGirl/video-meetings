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

const VALID_FIXTURE = path.join(__dirname, 'fixtures', 'test-recording.mp3');
const INVALID_FIXTURE = path.join(__dirname, 'fixtures', 'invalid-file.txt');

// Each test gets its own meeting (rather than sharing one across the file,
// like meeting-detail.spec.ts does for its read-only assertions) since
// uploading mutates the meeting's file state and tests here run with
// Playwright's default parallelism — a shared meeting would let one test's
// upload leak into another's "no file yet" expectations.
async function createMeeting(
  request: APIRequestContext,
): Promise<{ id: string; title: string }> {
  const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
  const title = `E2E Upload Meeting ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await request.post(`${API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title,
      date: '2026-08-01T15:00:00.000Z',
      participants: [],
    },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to create test meeting: ${res.status()} ${await res.text()}`,
    );
  }
  const { id } = (await res.json()) as { id: string };
  return { id, title };
}

test.describe('meeting file upload control', () => {
  const meetingIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    await registerUserViaApi(request, TEST_USER_EMAIL, {
      ignoreConflict: true,
    });
  });

  test.afterEach(async () => {
    await Promise.all(meetingIds.splice(0).map(deleteMeetingById));
  });

  test('organizer uploads a valid recording and sees success', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await expect(
      page.getByRole('heading', { name: 'Upload a recording' }),
    ).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(VALID_FIXTURE);
    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByText('Recording uploaded')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Upload a recording' }),
    ).not.toBeVisible();
  });

  test('rejects an invalid file type with a specific message', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await page.locator('input[type="file"]').setInputFiles(INVALID_FIXTURE);

    await expect(page.getByText(/Unsupported file type/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  test('does not show the upload control to a non-organizer', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    const viewerEmail = `e2e-upload-viewer-${Date.now()}@video-meetings.local`;
    await registerUserViaApi(request, viewerEmail);

    await loginViaUi(page, viewerEmail);
    await page.goto(`/meetings/${id}`);

    await expect(
      page.getByRole('heading', { name: 'Upload a recording' }),
    ).not.toBeVisible();

    await deleteUserByEmail(viewerEmail);
  });
});
