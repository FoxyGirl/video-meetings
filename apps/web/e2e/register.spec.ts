import { test, expect } from '@playwright/test';
import {
  TEST_PASSWORD,
  deleteUserByEmail,
  registerUserViaApi,
} from './api-helpers';

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
