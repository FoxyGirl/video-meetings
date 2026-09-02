import path from 'node:path';
import { test, expect } from '@playwright/test';
import { deleteUserByEmail, registerUserViaApi } from './api-helpers';
import { loginViaUi } from './ui-helpers';

const VALID_FIXTURE = path.join(__dirname, 'fixtures', 'valid-avatar.png');
const INVALID_FIXTURE = path.join(__dirname, 'fixtures', 'invalid-file.txt');
// A real decodable PNG (unlike VALID_FIXTURE, whose content is arbitrary
// text — fine for upload validation, which only checks extension/declared
// MIME type, but not enough for the browser to actually render an <img>).
const REAL_IMAGE_FIXTURE = path.join(
  __dirname,
  'fixtures',
  'valid-avatar-image.png',
);
// Mirrors apps/web/src/entities/user/lib/avatar-file-types.ts's MAX_AVATAR_FILE_SIZE_BYTES
// (itself mirrored from the server's default) — no committed fixture file,
// an in-memory buffer one byte over the limit is enough to trigger client
// validation without bloating the repo with a 5 MB binary.
const OVERSIZED_AVATAR_BYTES = 5 * 1024 * 1024 + 1;

test.describe('avatar upload control', () => {
  const createdEmails: string[] = [];

  test.afterEach(async () => {
    await Promise.all(createdEmails.splice(0).map(deleteUserByEmail));
  });

  async function loginAsFreshUser(page: import('@playwright/test').Page) {
    const email = `e2e-avatar-upload-${Date.now()}-${Math.random().toString(36).slice(2)}@video-meetings.local`;
    createdEmails.push(email);
    await registerUserViaApi(page.request, email);
    await loginViaUi(page, email);
    await page.goto('/profile/edit');
    return email;
  }

  test('uploads a valid avatar and shows a success message', async ({
    page,
  }) => {
    await loginAsFreshUser(page);

    await page.locator('input[type="file"]').setInputFiles(VALID_FIXTURE);
    await page.getByRole('button', { name: 'Upload' }).click();

    await expect(page.getByText('Avatar updated')).toBeVisible();
  });

  test('renders the uploaded image in place of the initials placeholder', async ({
    page,
  }) => {
    await loginAsFreshUser(page);

    await expect(page.locator('img')).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles(REAL_IMAGE_FIXTURE);
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Avatar updated')).toBeVisible();

    await expect(page.locator('img').first()).toBeVisible();
  });

  test('rejects an invalid file type with a specific message', async ({
    page,
  }) => {
    await loginAsFreshUser(page);

    await page.locator('input[type="file"]').setInputFiles(INVALID_FIXTURE);

    await expect(page.getByText(/Unsupported file type/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  test('rejects an oversized file with a specific message', async ({
    page,
  }) => {
    await loginAsFreshUser(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'oversized-avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(OVERSIZED_AVATAR_BYTES),
    });

    await expect(page.getByText(/File is too large/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  test('an invalid file type rejection leaves the initials placeholder unchanged', async ({
    page,
  }) => {
    await loginAsFreshUser(page);
    await expect(page.locator('img')).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles(INVALID_FIXTURE);
    await expect(page.getByText(/Unsupported file type/)).toBeVisible();

    await expect(page.locator('img')).toHaveCount(0);
  });

  test('an oversized file rejection leaves the previously uploaded avatar unchanged', async ({
    page,
  }) => {
    await loginAsFreshUser(page);

    await page.locator('input[type="file"]').setInputFiles(REAL_IMAGE_FIXTURE);
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(page.getByText('Avatar updated')).toBeVisible();
    await expect(page.locator('img').first()).toBeVisible();
    const avatarSrcBefore = await page
      .locator('img')
      .first()
      .getAttribute('src');

    await page.locator('input[type="file"]').setInputFiles({
      name: 'oversized-avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(OVERSIZED_AVATAR_BYTES),
    });
    await expect(page.getByText(/File is too large/)).toBeVisible();

    await expect(page.locator('img').first()).toBeVisible();
    await expect(page.locator('img').first()).toHaveAttribute(
      'src',
      avatarSrcBefore ?? '',
    );
  });

  test('disables the upload button until a file is selected', async ({
    page,
  }) => {
    await loginAsFreshUser(page);

    await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });
});
