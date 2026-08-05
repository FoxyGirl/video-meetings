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

    await page.goto('/profile');

    await expect(page.getByTestId('profile-loading')).toBeVisible();
    await expect(page.getByTestId('profile-loading')).not.toBeVisible();
    await expect(page.getByText(TEST_USER_EMAIL).first()).toBeVisible();
  });
});
