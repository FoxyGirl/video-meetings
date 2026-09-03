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

// A far-future date guarantees the seeded meeting sorts first (most recent)
// among the shared test user's many other meetings, so it's always inside
// the home page's "Last three meetings" slice as well as "Your meetings".
const FAR_FUTURE_DATE = '2099-01-01T00:00:00.000Z';

async function createMeetingViaApi(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ id: string; title: string }> {
  const title = `E2E Delete Meeting ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await request.post(`${API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { title, date: FAR_FUTURE_DATE, participants: [] },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to create test meeting: ${res.status()} ${await res.text()}`,
    );
  }
  const { id } = (await res.json()) as { id: string };
  return { id, title };
}

test.describe('delete meeting UI', () => {
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

  test('organizer deletes a meeting via confirm and it disappears from both lists', async ({
    page,
    request,
  }) => {
    const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
    const { id, title } = await createMeetingViaApi(request, accessToken);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);

    // Present in both "Last three meetings" and "Your meetings".
    await expect(page.getByRole('heading', { name: title })).toHaveCount(2);

    const card = page.getByTestId(`meeting-card-${id}`).first();
    await card.getByRole('button', { name: 'Delete' }).click();
    await page
      .getByRole('alertdialog', { name: 'Delete this meeting?' })
      .getByRole('button', { name: 'Delete' })
      .click();

    await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  });

  test('canceling the delete confirmation leaves the meeting in place', async ({
    page,
    request,
  }) => {
    const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
    const { id, title } = await createMeetingViaApi(request, accessToken);
    meetingIds.push(id);

    await loginViaUi(page, TEST_USER_EMAIL);

    const card = page.getByTestId(`meeting-card-${id}`).first();
    await card.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('alertdialog', {
      name: 'Delete this meeting?',
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name: title })).toHaveCount(2);
  });

  test("a non-organizer participant does not see a delete action on a meeting they don't own", async ({
    page,
    request,
  }) => {
    const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);
    const { id, title } = await createMeetingViaApi(request, accessToken);
    meetingIds.push(id);

    // GET /meetings only ever returns meetings the caller organizes, so a
    // non-organizer can only reach this meeting via a direct link to its
    // detail page — never through their own home page lists.
    const viewerEmail = `e2e-delete-viewer-${Date.now()}@video-meetings.local`;
    createdEmails.push(viewerEmail);
    await registerUserViaApi(request, viewerEmail);

    await loginViaUi(page, viewerEmail);
    await page.goto(`/meetings/${id}`);

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete' }),
    ).not.toBeVisible();
  });
});
