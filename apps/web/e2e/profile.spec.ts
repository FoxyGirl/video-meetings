import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  TEST_USER_EMAIL,
  deleteUserByEmail,
  registerUserViaApi,
} from './api-helpers';
import { loginViaUi, usernameForm } from './ui-helpers';

// A real decodable PNG, needed here specifically because the assertion
// waits for the browser to actually render an <img> (unlike the upload
// flow's own fixture, whose content is arbitrary and only exercises
// extension/declared-MIME-type validation).
const VALID_AVATAR_FIXTURE = path.join(
  __dirname,
  'fixtures',
  'valid-avatar-image.png',
);

test.describe('profile page', () => {
  test('shows a loading spinner while the profile is being fetched', async ({
    page,
  }) => {
    // The profile is now fetched into auth-context right after login (app-
    // wide), not lazily when /profile mounts — so the delay is armed before
    // login, and /profile is visited while that same in-flight fetch is
    // still pending.
    await page.route('**/users/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    const profileResponse = page.waitForResponse('**/users/me');

    await loginViaUi(page, TEST_USER_EMAIL);
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
    // Delayed so it doesn't race the immediate post-login redirect to '/' —
    // the profile fetch now fires from auth-context right after login, in
    // the background, rather than only once /profile is visited.
    await page.route('**/users/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
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

    await loginViaUi(page, TEST_USER_EMAIL);

    await expect(page).toHaveURL('/login');
  });

  test('fetches the profile once after login and reuses it across profile pages', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-${Date.now()}-${Math.random().toString(36).slice(2)}@video-meetings.local`;
    await registerUserViaApi(request, email);

    try {
      let profileRequestCount = 0;
      await page.route('**/users/me', async (route) => {
        profileRequestCount++;
        await route.continue();
      });

      await loginViaUi(page, email);
      await page.goto('/profile');
      await expect(page.getByText(email).first()).toBeVisible();
      // Dev mode's React StrictMode double-invokes effects, so the login-
      // triggered fetch itself may already count as 2 — the property this
      // test cares about is that visiting a *second* profile page doesn't
      // trigger any further fetch, not the exact count.
      const countAfterProfile = profileRequestCount;
      expect(countAfterProfile).toBeGreaterThan(0);

      await page.getByRole('link', { name: 'Edit profile' }).click();
      await expect(page).toHaveURL('/profile/edit');
      await expect(page.getByText(email).first()).toBeVisible();

      expect(profileRequestCount).toBe(countAfterProfile);
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test('links to the edit page', async ({ page }) => {
    await loginViaUi(page, TEST_USER_EMAIL);

    await page.goto('/profile');
    await expect(page.getByText(TEST_USER_EMAIL).first()).toBeVisible();

    await page.getByRole('link', { name: 'Edit profile' }).click();

    await expect(page).toHaveURL('/profile/edit');
  });

  test('reflects a username updated on the edit page after navigating back', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-${Date.now()}-${Math.random().toString(36).slice(2)}@video-meetings.local`;
    await registerUserViaApi(request, email);

    try {
      await loginViaUi(page, email);
      await page.goto('/profile');
      await expect(page.getByText(email).first()).toBeVisible();

      await page.getByRole('link', { name: 'Edit profile' }).click();
      await expect(page).toHaveURL('/profile/edit');
      await page
        .getByRole('textbox', { name: 'Username' })
        .fill('Updated Name');
      await usernameForm(page).getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Username updated')).toBeVisible();

      await page.goto('/profile');

      await expect(page.getByText('Updated Name').first()).toBeVisible();
      await expect(page.getByText(email).first()).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test('shows the uploaded avatar image instead of the initials placeholder after a fresh page load', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-${Date.now()}-${Math.random().toString(36).slice(2)}@video-meetings.local`;
    await registerUserViaApi(request, email);

    try {
      await loginViaUi(page, email);
      await page.goto('/profile/edit');
      await expect(page.locator('img')).toHaveCount(0);

      await page
        .locator('input[type="file"]')
        .setInputFiles(VALID_AVATAR_FIXTURE);
      await page.getByRole('button', { name: 'Upload' }).click();
      await expect(page.getByText('Avatar updated')).toBeVisible();

      await page.goto('/profile');

      await expect(page.locator('img').first()).toBeVisible();
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
