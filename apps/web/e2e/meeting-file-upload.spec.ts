import fs from 'node:fs';
import path from 'node:path';
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
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
const DROP_ZONE = '[data-testid="upload-drop-zone"]';

// Real OS drag-and-drop isn't something Playwright can simulate directly, so
// each helper below builds an in-browser DataTransfer (backed by actual file
// bytes read from disk) and dispatches the corresponding drag event against
// it — this exercises the same DataTransfer-reading code path the app uses,
// unlike faking it via setInputFiles on the hidden <input>.
async function buildDataTransfer(
  page: Page,
  files: { path: string; mimeType: string }[],
) {
  const payload = files.map(({ path: filePath, mimeType }) => ({
    bytes: [...fs.readFileSync(filePath)],
    name: path.basename(filePath),
    mimeType,
  }));
  return page.evaluateHandle((entries) => {
    const dt = new DataTransfer();
    for (const entry of entries) {
      const file = new File([new Uint8Array(entry.bytes)], entry.name, {
        type: entry.mimeType,
      });
      dt.items.add(file);
    }
    return dt;
  }, payload);
}

async function dropFiles(
  page: Page,
  files: { path: string; mimeType: string }[],
) {
  const dataTransfer = await buildDataTransfer(page, files);
  await page.dispatchEvent(DROP_ZONE, 'drop', { dataTransfer });
}

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
    createdEmails.push(viewerEmail);
    await registerUserViaApi(request, viewerEmail);

    await loginViaUi(page, viewerEmail);
    await page.goto(`/meetings/${id}`);

    await expect(
      page.getByRole('heading', { name: 'Upload a recording' }),
    ).not.toBeVisible();
  });

  test('highlights the drop zone on drag-over and clears it on drag-leave', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const dropZone = page.locator(DROP_ZONE);
    const dataTransfer = await buildDataTransfer(page, [
      { path: VALID_FIXTURE, mimeType: 'audio/mpeg' },
    ]);

    await dropZone.dispatchEvent('dragenter', { dataTransfer });
    await expect(dropZone).toHaveClass(/border-indigo-500/);

    await dropZone.dispatchEvent('dragleave', { dataTransfer });
    await expect(dropZone).not.toHaveClass(/border-indigo-500/);
  });

  test('uploads a valid recording dropped onto the zone', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await dropFiles(page, [{ path: VALID_FIXTURE, mimeType: 'audio/mpeg' }]);
    await expect(page.getByRole('button', { name: 'Upload' })).toBeEnabled();

    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByText('Recording uploaded')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Upload a recording' }),
    ).not.toBeVisible();
  });

  test('rejects a dropped invalid file type with the same message as the click flow', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await dropFiles(page, [{ path: INVALID_FIXTURE, mimeType: 'text/plain' }]);

    await expect(page.getByText(/Unsupported file type/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  test('rejects dropping multiple files with a single-file message', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await dropFiles(page, [
      { path: VALID_FIXTURE, mimeType: 'audio/mpeg' },
      { path: INVALID_FIXTURE, mimeType: 'text/plain' },
    ]);

    await expect(page.getByText('Please drop a single file.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  test('rejects dropping non-file drag data with a clear message', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add('some text', 'text/plain');
      return dt;
    });
    await page.dispatchEvent(DROP_ZONE, 'drop', { dataTransfer });

    await expect(page.getByText(/No file detected in the drop/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });
});
