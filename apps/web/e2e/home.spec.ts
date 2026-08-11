import { test, expect } from '@playwright/test';
import { deleteUserByEmail, registerUserViaApi } from './api-helpers';
import { loginViaUi } from './ui-helpers';

test.describe('main page logged-in-user area', () => {
  const createdEmails: string[] = [];

  test.afterEach(async () => {
    await Promise.all(createdEmails.splice(0).map(deleteUserByEmail));
  });

  async function loginAsFreshUser(page: import('@playwright/test').Page) {
    const email = `e2e-home-${Date.now()}-${Math.random().toString(36).slice(2)}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(page.request, email);
    await loginViaUi(page, email);
    return email;
  }

  test('shows the avatar and email for a user with no username set', async ({
    page,
  }) => {
    const email = await loginAsFreshUser(page);

    // Fallback initials are derived from the email local part.
    await expect(
      page.getByText(email.slice(0, 2).toUpperCase(), { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
  });

  test('shows the username instead of the email once one is set', async ({
    page,
  }) => {
    const email = await loginAsFreshUser(page);

    await page.goto('/profile/edit');
    await page.getByRole('textbox', { name: 'Username' }).fill('Jane Doe');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Username updated')).toBeVisible();

    await page.goto('/');

    await expect(page.getByText('Jane Doe').first()).toBeVisible();
    await expect(page.getByText(email)).not.toBeVisible();
  });

  test('clicking the avatar navigates to the profile page', async ({
    page,
  }) => {
    await loginAsFreshUser(page);

    await page.getByRole('link', { name: 'View profile' }).click();

    await expect(page).toHaveURL('/profile');
  });
});
