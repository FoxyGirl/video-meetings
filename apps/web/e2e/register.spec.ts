import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/video_meetings';
const TEST_PASSWORD = 'TestPassword123!';

async function registerUserViaApi(request: APIRequestContext, email: string) {
  const res = await request.post(`${API_URL}/auth/register`, {
    data: { email, password: TEST_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to provision user via API: ${res.status()} ${await res.text()}`,
    );
  }
}

// Deletes a user created for a test directly from Postgres — there is no
// delete-user API endpoint, and these are throwaway accounts scoped to a
// single test run, so talking to the dev database directly (same approach
// apps/api's own e2e suite uses for cleanup) is simpler than adding one.
async function deleteUserByEmail(email: string) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM "User" WHERE email = $1', [email]);
  } finally {
    await client.end();
  }
}

test.describe('register page', () => {
  const createdEmails: string[] = [];

  test.afterEach(async () => {
    await Promise.all(createdEmails.splice(0).map(deleteUserByEmail));
  });

  test('creates a new account and redirects to the meetings home page', async ({
    page,
  }) => {
    const email = `e2e-register-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);

    await page.goto('/register');
    await page.getByRole('textbox', { name: 'Email*' }).fill(email);
    await page
      .getByRole('textbox', { name: 'Password*', exact: true })
      .fill(TEST_PASSWORD);
    await page
      .getByRole('textbox', { name: 'Confirm password*' })
      .fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText(email)).toBeVisible();
  });

  test('shows a validation error when passwords do not match', async ({
    page,
  }) => {
    const email = `e2e-register-${Date.now()}@video-meetings.local`;

    await page.goto('/register');
    await page.getByRole('textbox', { name: 'Email*' }).fill(email);
    await page
      .getByRole('textbox', { name: 'Password*', exact: true })
      .fill(TEST_PASSWORD);
    await page
      .getByRole('textbox', { name: 'Confirm password*' })
      .fill('SomethingElse123!');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('shows a validation error for an invalid email address', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByRole('textbox', { name: 'Email*' }).fill('not-an-email');
    await page
      .getByRole('textbox', { name: 'Password*', exact: true })
      .fill(TEST_PASSWORD);
    await page
      .getByRole('textbox', { name: 'Confirm password*' })
      .fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('shows an error when the email is already registered', async ({
    page,
    request,
  }) => {
    const email = `e2e-register-taken-${Date.now()}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(request, email);

    await page.goto('/register');
    await page.getByRole('textbox', { name: 'Email*' }).fill(email);
    await page
      .getByRole('textbox', { name: 'Password*', exact: true })
      .fill(TEST_PASSWORD);
    await page
      .getByRole('textbox', { name: 'Confirm password*' })
      .fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(
      page.getByText('An account with this email already exists.'),
    ).toBeVisible();
    await expect(page).toHaveURL('/register');
  });
});
