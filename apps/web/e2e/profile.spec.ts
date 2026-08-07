import { test, expect } from '@playwright/test';
import { TEST_USER_EMAIL } from './api-helpers';
import { loginViaUi } from './ui-helpers';

test.describe('profile page', () => {
  test('shows a loading spinner while the profile is being fetched', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);

    await page.route('**/users/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    const profileResponse = page.waitForResponse('**/users/me');

    await page.goto('/profile');

    await expect(page.getByTestId('profile-loading')).toBeVisible();

    await profileResponse;

    await expect(page.getByTestId('profile-loading')).not.toBeVisible();
    await expect(page.getByText(TEST_USER_EMAIL).first()).toBeVisible();
  });

  test('redirects unauthenticated visitors to the login page', async ({
    page,
  }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL('/login');
  });

  test('redirects to the login page when the profile fetch returns 401', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);

    await page.route('**/users/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 401,
          message: 'Invalid or expired token',
          error: 'Unauthorized',
        }),
      });
    });

    await page.goto('/profile');

    await expect(page).toHaveURL('/login');
  });

  test('links to the edit page', async ({ page }) => {
    await loginViaUi(page, TEST_USER_EMAIL);

    await page.goto('/profile');
    await expect(page.getByText(TEST_USER_EMAIL).first()).toBeVisible();

    await page.getByRole('link', { name: 'Edit profile' }).click();

    await expect(page).toHaveURL('/profile/edit');
  });
});
