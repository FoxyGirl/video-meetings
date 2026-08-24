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
const VALID_BYTES = fs.readFileSync(VALID_FIXTURE);

// Real OS drag-and-drop isn't something Playwright can simulate directly, so
// each helper below builds an in-browser DataTransfer (backed by actual file
// bytes read from disk) and dispatches the corresponding drag event against
// it — this exercises the same DataTransfer-reading code path the app uses,
// unlike faking it via setInputFiles on the hidden <input>. `name` lets a
// caller give two entries built from the same underlying fixture distinct
// filenames, needed for multi-file batches where each entry must look like
// a genuinely different upload.
async function buildDataTransfer(
  page: Page,
  files: { path: string; mimeType: string; name?: string }[],
) {
  const payload = files.map(({ path: filePath, mimeType, name }) => ({
    bytes: [...fs.readFileSync(filePath)],
    name: name ?? path.basename(filePath),
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
  files: { path: string; mimeType: string; name?: string }[],
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

// Seeds a single file directly through the API (multipart, same as
// meeting-file-management.spec.ts's createMeetingWithFile) — used to get a
// meeting to a known file count before exercising the UI, without a slow
// batch of UI-driven uploads.
async function uploadFileViaApi(
  request: APIRequestContext,
  meetingId: string,
  accessToken: string,
  name: string,
) {
  const res = await request.post(`${API_URL}/meetings/${meetingId}/files`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    multipart: {
      files: { name, mimeType: 'audio/mpeg', buffer: VALID_BYTES },
    },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to seed test file via API: ${res.status()} ${await res.text()}`,
    );
  }
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
      page.getByText('test-recording.mp3 uploaded successfully'),
    ).toBeVisible();
    // Below the 10-file cap, the upload control stays put instead of being
    // replaced by the file it just accepted.
    await expect(
      page.getByRole('heading', { name: 'Upload a recording' }),
    ).toBeVisible();
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

  // Regression check: a single file dropped onto the zone still uploads
  // successfully now that the zone also accepts multiple files at once.
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
      page.getByText('test-recording.mp3 uploaded successfully'),
    ).toBeVisible();
  });

  test('uploads several files selected at once and all appear in the file list', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await page.locator('input[type="file"]').setInputFiles([
      { name: 'recording-a.mp3', mimeType: 'audio/mpeg', buffer: VALID_BYTES },
      { name: 'recording-b.mp3', mimeType: 'audio/mpeg', buffer: VALID_BYTES },
    ]);
    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByText('2 recordings uploaded')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recording', exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText('recording-a.mp3', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('recording-b.mp3', { exact: true }),
    ).toBeVisible();
  });

  test('uploads multiple files dropped onto the zone at once', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await dropFiles(page, [
      { path: VALID_FIXTURE, mimeType: 'audio/mpeg', name: 'dropped-a.mp3' },
      { path: VALID_FIXTURE, mimeType: 'audio/mpeg', name: 'dropped-b.mp3' },
    ]);
    await expect(page.getByRole('button', { name: 'Upload' })).toBeEnabled();

    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByText('2 recordings uploaded')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recording', exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText('dropped-a.mp3', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('dropped-b.mp3', { exact: true }),
    ).toBeVisible();
  });

  test('a mixed valid/invalid batch shows one success and one file-specific error', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await page.locator('input[type="file"]').setInputFiles([
      { name: 'good.mp3', mimeType: 'audio/mpeg', buffer: VALID_BYTES },
      {
        name: 'bad.txt',
        mimeType: 'text/plain',
        buffer: fs.readFileSync(INVALID_FIXTURE),
      },
    ]);
    // The invalid file is caught by client-side validation immediately,
    // before the Upload click.
    await expect(
      page
        .getByTestId('staged-file-list')
        .getByText(/bad\.txt: Unsupported file type/),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Upload' }).click();

    const batchResult = page.getByTestId('upload-batch-result');
    await expect(
      batchResult.getByText('good.mp3 uploaded successfully'),
    ).toBeVisible();
    await expect(
      batchResult.getByText(/bad\.txt: Unsupported file type/),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recording', exact: true }),
    ).toHaveCount(1);
  });

  test('uploading past the 10-file cap accepts what fits and rejects the rest', async ({
    page,
    request,
  }) => {
    const { id } = await createMeeting(request);
    meetingIds.push(id);
    const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
    for (let i = 1; i <= 9; i += 1) {
      await uploadFileViaApi(request, id, accessToken, `seed-${i}.mp3`);
    }

    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/${id}`);

    await expect(
      page.getByRole('heading', { name: 'Recording', exact: true }),
    ).toHaveCount(9);

    // 9 existing + 2 more in one batch = 11 requested; only 1 more fits.
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'tenth.mp3', mimeType: 'audio/mpeg', buffer: VALID_BYTES },
      { name: 'eleventh.mp3', mimeType: 'audio/mpeg', buffer: VALID_BYTES },
    ]);
    await page.getByRole('button', { name: 'Upload' }).click();

    // Accepting tenth.mp3 brings the meeting to the 10-file cap, which
    // un-renders the whole upload card (and its inline batch feedback) on
    // the very next render — the toast (rendered outside the card) is what's
    // asserted on instead, same as a real user would still see it.
    await expect(
      page.getByText('Recording uploaded, One file was rejected'),
    ).toBeVisible();
    await expect(
      page.getByText(/eleventh\.mp3:.*maximum of 10 files/),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recording', exact: true }),
    ).toHaveCount(10);
    // At the cap, the upload control no longer renders.
    await expect(
      page.getByRole('heading', { name: 'Upload a recording' }),
    ).not.toBeVisible();
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

    await expect(page.getByText(/No files detected in the drop/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });
});
