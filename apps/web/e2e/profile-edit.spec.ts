import { test, expect } from '@playwright/test';
import {
  API_URL,
  TEST_USER_EMAIL,
  deleteUserByEmail,
  loginUserViaApi,
  registerUserViaApi,
} from './api-helpers';
import { loginViaUi } from './ui-helpers';

test.describe('profile edit page', () => {
  test('shows a loading spinner while the profile is being fetched', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);

    await page.route('**/users/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    const profileResponse = page.waitForResponse('**/users/me');

    await page.goto('/profile/edit');

    await expect(page.getByTestId('profile-edit-loading')).toBeVisible();

    await profileResponse;

    await expect(page.getByTestId('profile-edit-loading')).not.toBeVisible();
    await expect(page.getByText(TEST_USER_EMAIL).first()).toBeVisible();
  });

  test('redirects unauthenticated visitors to the login page', async ({
    page,
  }) => {
    await page.goto('/profile/edit');
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

    await page.goto('/profile/edit');

    await expect(page).toHaveURL('/login');
  });
});

test.describe('username form', () => {
  const createdEmails: string[] = [];

  test.afterEach(async () => {
    await Promise.all(createdEmails.splice(0).map(deleteUserByEmail));
  });

  test('prefills the username field with the current value', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-edit-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(request, email);
    const accessToken = await loginUserViaApi(request, email);
    await request.patch(`${API_URL}/users/me/username`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { username: 'Existing Name' },
    });

    await loginViaUi(page, email);
    await page.goto('/profile/edit');

    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue(
      'Existing Name',
    );
  });

  test('updates the username and shows a success message', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-edit-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(request, email);

    await loginViaUi(page, email);
    await page.goto('/profile/edit');

    await page
      .getByRole('textbox', { name: 'Username' })
      .fill('New Display Name');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Username updated')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue(
      'New Display Name',
    );
  });

  test('shows the server-trimmed value in the field after saving surrounding whitespace', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-edit-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(request, email);

    await loginViaUi(page, email);
    await page.goto('/profile/edit');

    await page
      .getByRole('textbox', { name: 'Username' })
      .fill('  Padded Name  ');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Username updated')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue(
      'Padded Name',
    );
  });

  test('keeps the field in sync when trimming yields the already-stored value', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-edit-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(request, email);

    await loginViaUi(page, email);
    await page.goto('/profile/edit');

    await page.getByRole('textbox', { name: 'Username' }).fill('Alice');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Username updated')).toBeVisible();

    await page.getByRole('textbox', { name: 'Username' }).fill('  Alice  ');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('textbox', { name: 'Username' })).toHaveValue(
      'Alice',
    );
  });

  test('shows an error message when the update fails', async ({ page }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    await page.route('**/users/me/username', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, message: 'Server error' }),
      });
    });

    await page.getByRole('textbox', { name: 'Username' }).fill('Will Fail');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Server error')).toBeVisible();
  });

  test('rejects a username over 50 characters without issuing a request', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    let requestIssued = false;
    await page.route('**/users/me/username', async (route) => {
      requestIssued = true;
      await route.continue();
    });

    await page.getByRole('textbox', { name: 'Username' }).fill('x'.repeat(51));
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText('Username must be 50 characters or fewer.'),
    ).toBeVisible();
    expect(requestIssued).toBe(false);
  });

  test('clears the username and falls back to the email on the profile page', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-edit-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(request, email);
    const accessToken = await loginUserViaApi(request, email);
    await request.patch(`${API_URL}/users/me/username`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { username: 'Soon Cleared' },
    });

    await loginViaUi(page, email);
    await page.goto('/profile/edit');

    await page.getByRole('textbox', { name: 'Username' }).fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Username updated')).toBeVisible();

    await page.goto('/profile');
    await expect(page.getByText(email).first()).toBeVisible();
    await expect(page.getByText('Soon Cleared')).not.toBeVisible();
  });
});
