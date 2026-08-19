import { test, expect } from '@playwright/test';
import {
  API_URL,
  TEST_PASSWORD,
  TEST_USER_EMAIL,
  deleteUserByEmail,
  loginUserViaApi,
  registerUserViaApi,
} from './api-helpers';
import { loginViaUi, passwordForm, usernameForm } from './ui-helpers';

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
    await usernameForm(page).getByRole('button', { name: 'Save' }).click();

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
    await usernameForm(page).getByRole('button', { name: 'Save' }).click();

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
    await usernameForm(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Username updated')).toBeVisible();

    await page.getByRole('textbox', { name: 'Username' }).fill('  Alice  ');
    await usernameForm(page).getByRole('button', { name: 'Save' }).click();

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
    await usernameForm(page).getByRole('button', { name: 'Save' }).click();

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
    await usernameForm(page).getByRole('button', { name: 'Save' }).click();

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
    await usernameForm(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Username updated')).toBeVisible();

    await page.goto('/profile');
    await expect(page.getByText(email).first()).toBeVisible();
    await expect(page.getByText('Soon Cleared')).not.toBeVisible();
  });
});

test.describe('password form', () => {
  const createdEmails: string[] = [];

  test.afterEach(async () => {
    await Promise.all(createdEmails.splice(0).map(deleteUserByEmail));
  });

  test('renders the current and new password fields', async ({ page }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    await expect(page.getByLabel('Current password')).toBeVisible();
    await expect(page.getByLabel('New password')).toBeVisible();
  });

  test('toggles visibility of the current and new password fields independently', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    const currentPasswordInput = page.getByLabel('Current password');
    const newPasswordInput = page.getByLabel('New password');
    await expect(currentPasswordInput).toHaveAttribute('type', 'password');
    await expect(newPasswordInput).toHaveAttribute('type', 'password');

    await passwordForm(page)
      .getByRole('button', { name: 'Show password' })
      .first()
      .click();

    await expect(currentPasswordInput).toHaveAttribute('type', 'text');
    await expect(newPasswordInput).toHaveAttribute('type', 'password');
  });

  test('requires the current password without issuing a request', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    let requestIssued = false;
    await page.route('**/users/me/password', async (route) => {
      requestIssued = true;
      await route.continue();
    });

    await page.getByLabel('New password').fill('a-valid-new-password');
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Enter your current password.')).toBeVisible();
    expect(requestIssued).toBe(false);
  });

  test('rejects a new password under 8 characters without issuing a request', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    let requestIssued = false;
    await page.route('**/users/me/password', async (route) => {
      requestIssued = true;
      await route.continue();
    });

    await page.getByLabel('Current password').fill(TEST_PASSWORD);
    await page.getByLabel('New password').fill('short');
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText('New password must be at least 8 characters.'),
    ).toBeVisible();
    expect(requestIssued).toBe(false);
  });

  test('submits independently from the username form', async ({ page }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    let passwordRequestIssued = false;
    await page.route('**/users/me/password', async (route) => {
      passwordRequestIssued = true;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 403,
          message: 'Invalid credentials',
          error: 'Forbidden',
        }),
      });
    });
    let usernameRequestIssued = false;
    await page.route('**/users/me/username', async (route) => {
      usernameRequestIssued = true;
      await route.continue();
    });

    await page.getByLabel('Current password').fill('wrong-password');
    await page.getByLabel('New password').fill('a-valid-new-password');
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Incorrect current password.')).toBeVisible();
    expect(passwordRequestIssued).toBe(true);
    expect(usernameRequestIssued).toBe(false);
  });

  test('shows an error for the wrong current password without logging the user out', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    await page.route('**/users/me/password', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 403,
          message: 'Invalid credentials',
          error: 'Forbidden',
        }),
      });
    });

    await page.getByLabel('Current password').fill('wrong-password');
    await page.getByLabel('New password').fill('a-valid-new-password');
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();

    // Distinct field-level feedback, not the form's shared failure Alert:
    // attached to the Current password field specifically, since the wrong
    // password is a problem with that field, not the form as a whole.
    await expect(page.getByText('Incorrect current password.')).toBeVisible();
    await expect(page.getByLabel('Current password')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page).toHaveURL('/profile/edit');
  });

  test('shows a new-password field error when it matches the current password', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    await page.route('**/users/me/password', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 400,
          message: 'New password must differ from current password',
          error: 'Bad Request',
        }),
      });
    });

    await page.getByLabel('Current password').fill(TEST_PASSWORD);
    await page.getByLabel('New password').fill(TEST_PASSWORD);
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText(
        'New password must be different from your current password.',
      ),
    ).toBeVisible();
    await expect(page.getByLabel('New password')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('falls back to the shared alert for an unexpected password failure', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    await page.route('**/users/me/password', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, message: 'Server error' }),
      });
    });

    await page.getByLabel('Current password').fill(TEST_PASSWORD);
    await page.getByLabel('New password').fill('a-valid-new-password');
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Server error')).toBeVisible();
    await expect(page.getByLabel('Current password')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('redirects to the login page when the session has actually expired', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/profile/edit');

    await page.route('**/users/me/password', async (route) => {
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

    await page.getByLabel('Current password').fill(TEST_PASSWORD);
    await page.getByLabel('New password').fill('a-valid-new-password');
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL('/login');
  });

  test('changes the password and keeps the session usable', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-edit-pw-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(request, email);
    const newPassword = 'NewPassword123!';

    await loginViaUi(page, email);
    await page.goto('/profile/edit');

    await page.getByLabel('Current password').fill(TEST_PASSWORD);
    await page.getByLabel('New password').fill(newPassword);
    const responsePromise = page.waitForResponse('**/users/me/password');
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    // The session's token is reissued on success and the page stays put
    // rather than bouncing to /login the way a real 401 would.
    await expect(page).toHaveURL('/profile/edit');

    const accessToken = await loginUserViaApi(request, email, newPassword);
    expect(accessToken).toBeTruthy();
  });

  test('shows a success message and clears the form fields', async ({
    page,
    request,
  }) => {
    const email = `e2e-profile-edit-pw-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(request, email);
    const newPassword = 'NewPassword123!';

    await loginViaUi(page, email);
    await page.goto('/profile/edit');

    await page.getByLabel('Current password').fill(TEST_PASSWORD);
    await page.getByLabel('New password').fill(newPassword);
    await passwordForm(page).getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Password updated')).toBeVisible();
    await expect(page.getByLabel('Current password')).toHaveValue('');
    await expect(page.getByLabel('New password')).toHaveValue('');
  });
});
