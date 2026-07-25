import { expect, type Page } from '@playwright/test';
import { TEST_PASSWORD } from './api-helpers';

export async function loginViaUi(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email*' }).fill(email);
  await page.getByRole('textbox', { name: 'Password*' }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
