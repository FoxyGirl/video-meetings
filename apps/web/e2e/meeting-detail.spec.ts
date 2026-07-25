import { test, expect } from '@playwright/test';
import {
  API_URL,
  TEST_USER_EMAIL,
  deleteMeetingById,
  deleteUserByEmail,
  loginUserViaApi,
  registerUserViaApi,
} from './api-helpers';
import { loginViaUi } from './ui-helpers';

test.describe('shared meeting detail page', () => {
  let meetingId: string;
  let meetingTitle: string;
  const createdEmails: string[] = [];

  test.beforeAll(async ({ request }) => {
    await registerUserViaApi(request, TEST_USER_EMAIL, {
      ignoreConflict: true,
    });
    const accessToken = await loginUserViaApi(request, TEST_USER_EMAIL);

    meetingTitle = `E2E Meeting ${Date.now()}`;
    const res = await request.post(`${API_URL}/meetings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        title: meetingTitle,
        date: '2026-08-01T15:00:00.000Z',
        participants: ['alice@example.com', 'bob@example.com'],
      },
    });
    if (!res.ok()) {
      throw new Error(
        `Failed to create test meeting: ${res.status()} ${await res.text()}`,
      );
    }
    ({ id: meetingId } = (await res.json()) as { id: string });
  });

  test.afterAll(async () => {
    await deleteMeetingById(meetingId);
  });

  test.afterEach(async () => {
    await Promise.all(createdEmails.splice(0).map(deleteUserByEmail));
  });

  test('organizer can sign in and view their meeting details', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.locator(`a[href="/meetings/${meetingId}"]`).first().click();

    await expect(page).toHaveURL(`/meetings/${meetingId}`);
    await expect(
      page.getByRole('heading', { name: meetingTitle }),
    ).toBeVisible();
    await expect(
      page.getByText('You are the organizer of this meeting.'),
    ).toBeVisible();
    await expect(
      page.getByText('alice@example.com, bob@example.com'),
    ).toBeVisible();
  });

  test('does not show the organizer badge to a non-organizer', async ({
    page,
    request,
  }) => {
    const viewerEmail = `e2e-viewer-${Date.now()}@video-meetings.local`;
    createdEmails.push(viewerEmail);
    await registerUserViaApi(request, viewerEmail);

    await loginViaUi(page, viewerEmail);
    await page.goto(`/meetings/${meetingId}`);

    await expect(
      page.getByRole('heading', { name: meetingTitle }),
    ).toBeVisible();
    await expect(
      page.getByText('You are the organizer of this meeting.'),
    ).not.toBeVisible();
  });

  test('shows a friendly error for an invalid or deleted meeting id', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto(`/meetings/nonexistent-${Date.now()}`);

    await expect(
      page.getByText('This meeting doesn’t exist or has been deleted.'),
    ).toBeVisible();
  });

  test('redirects unauthenticated visitors to the login page', async ({
    page,
  }) => {
    await page.goto(`/meetings/${meetingId}`);
    await expect(page).toHaveURL('/login');
  });
});
