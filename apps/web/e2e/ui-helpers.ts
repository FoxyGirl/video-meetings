import { expect, type Page } from '@playwright/test';
import { TEST_PASSWORD } from './api-helpers';

export async function loginViaUi(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email*' }).fill(email);
  await page.getByRole('textbox', { name: 'Password*' }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

// /profile/edit renders both the username and password forms with their own
// "Save" button, so a bare getByRole('button', { name: 'Save' }) is
// ambiguous once both exist on the page — scope to the enclosing <form> via
// a field only that form has.
export function usernameForm(page: Page) {
  return page
    .locator('form')
    .filter({ has: page.getByRole('textbox', { name: 'Username' }) });
}

export function passwordForm(page: Page) {
  return page
    .locator('form')
    .filter({ has: page.getByLabel('Current password') });
}
