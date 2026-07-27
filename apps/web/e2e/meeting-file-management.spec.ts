import fs from 'node:fs/promises';
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

// Seeds a meeting via the API, same as meeting-file-upload.spec.ts's own
// createMeeting, then uploads the fixture straight through the API too
// (multipart, via Playwright's APIRequestContext) rather than the UI — the
// upload flow itself is already covered by meeting-file-upload.spec.ts, so
// tests here only need a meeting that already has a stored file.
async function createMeetingWithFile(
  request: APIRequestContext,
): Promise<{ id: string; title: string }> {
  const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
  const title = `E2E File Mgmt Meeting ${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const createRes = await request.post(`${API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { title, date: '2026-08-01T15:00:00.000Z', participants: [] },
  });
  if (!createRes.ok()) {
    throw new Error(
      `Failed to create test meeting: ${createRes.status()} ${await createRes.text()}`,
    );
  }
  const { id } = (await createRes.json()) as { id: string };

  const uploadRes = await request.post(`${API_URL}/meetings/${id}/file`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    multipart: {
      file: {
        name: 'test-recording.mp3',
        mimeType: 'audio/mpeg',
        buffer: await fs.readFile(VALID_FIXTURE),
      },
    },
  });
  if (!uploadRes.ok()) {
    throw new Error(
      `Failed to seed test file via API: ${uploadRes.status()} ${await uploadRes.text()}`,
    );
  }

  return { id, title };
}

async function createMeetingWithoutFile(
  request: APIRequestContext,
): Promise<{ id: string; title: string }> {
  const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
  const title = `E2E No Recording Meeting ${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

test.describe('meeting file metadata, download, and delete', () => {
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

  test('organizer sees metadata, downloads, and deletes to revert to the upload control', async ({
    page,
    request,
  }) => {
    const { id } = await createMeetingWithFile(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await expect(
      page.getByRole('heading', { name: 'Recording' }),
    ).toBeVisible();
    await expect(page.getByText('test-recording.mp3')).toBeVisible();
    await expect(page.getByText('2.0 KB')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('test-recording.mp3');

    await page.getByRole('button', { name: 'Delete' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete' })
      .click();

    await expect(
      page.getByRole('heading', { name: 'Upload a recording' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recording', exact: true }),
    ).not.toBeVisible();
  });

  test('a non-organizer sees metadata and can download but never sees delete', async ({
    page,
    request,
  }) => {
    const { id } = await createMeetingWithFile(request);
    meetingIds.push(id);

    const viewerEmail = `e2e-file-viewer-${Date.now()}@video-meetings.local`;
    createdEmails.push(viewerEmail);
    await registerUserViaApi(request, viewerEmail);

    await loginViaUi(page, viewerEmail);
    await page.goto(`/meetings/${id}`);

    await expect(
      page.getByRole('heading', { name: 'Recording' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete' }),
    ).not.toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('test-recording.mp3');
  });

  test('a non-organizer sees a "no recording yet" message when the meeting has no file', async ({
    page,
    request,
  }) => {
    const { id } = await createMeetingWithoutFile(request);
    meetingIds.push(id);

    const viewerEmail = `e2e-no-file-viewer-${Date.now()}@video-meetings.local`;
    createdEmails.push(viewerEmail);
    await registerUserViaApi(request, viewerEmail);

    await loginViaUi(page, viewerEmail);
    await page.goto(`/meetings/${id}`);

    await expect(page.getByText('No recording yet.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Choose File' }),
    ).not.toBeVisible();
  });
});
