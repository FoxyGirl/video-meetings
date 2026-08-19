import { test, expect } from '@playwright/test';
import { TEST_USER_EMAIL, deleteMeetingById } from './api-helpers';
import { loginViaUi } from './ui-helpers';

test.describe('create meeting page', () => {
  let createdMeetingId: string | undefined;

  test.afterEach(async () => {
    if (createdMeetingId) {
      await deleteMeetingById(createdMeetingId);
      createdMeetingId = undefined;
    }
  });

  test('an authenticated user can create a meeting and lands on its detail page', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/meetings/new');

    const meetingTitle = `E2E Create ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Title' }).fill(meetingTitle);
    await page
      .getByRole('textbox', { name: 'Date and time' })
      .fill('2026-09-01T10:00');
    await page
      .getByRole('textbox', { name: 'Participants' })
      .fill('alice@example.com, bob@example.com');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(page).toHaveURL(/\/meetings\/[^/]+$/);
    createdMeetingId = new URL(page.url()).pathname.split('/').pop();

    await expect(
      page.getByRole('heading', { name: meetingTitle }),
    ).toBeVisible();
    await expect(page.getByText('9/1/2026, 10:00:00 AM')).toBeVisible();
    await expect(
      page.getByText('alice@example.com, bob@example.com'),
    ).toBeVisible();
  });

  test('redirects unauthenticated visitors to the login page', async ({
    page,
  }) => {
    await page.goto('/meetings/new');
    await expect(page).toHaveURL('/login');
  });
});
