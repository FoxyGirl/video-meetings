import { test, expect } from '@playwright/test';
import { TEST_USER_EMAIL, deleteMeetingById } from './api-helpers';
import { loginViaUi } from './ui-helpers';

test.describe('create meeting page', () => {
  let createdMeetingId: string | undefined;

  test.afterEach(async () => {
    if (createdMeetingId) {
      await deleteMeetingById(createdMeetingId);
      createdMeetingId = undefined;
    }
  });

  test('an authenticated user can create a meeting and lands on its detail page', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/meetings/new');

    const meetingTitle = `E2E Create ${Date.now()}`;
    await page.getByRole('textbox', { name: 'Title' }).fill(meetingTitle);
    await page
      .getByRole('textbox', { name: 'Date and time' })
      .fill('2026-09-01T10:00');
    await page
      .getByRole('textbox', { name: 'Participants' })
      .fill('alice@example.com, bob@example.com');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(page).toHaveURL(/\/meetings\/[^/]+$/);
    createdMeetingId = new URL(page.url()).pathname.split('/').pop();

    await expect(
      page.getByRole('heading', { name: meetingTitle }),
    ).toBeVisible();
    await expect(
      page.getByText('alice@example.com, bob@example.com'),
    ).toBeVisible();
  });

  test('redirects unauthenticated visitors to the login page', async ({
    page,
  }) => {
    await page.goto('/meetings/new');
    await expect(page).toHaveURL('/login');
  });

  test('rejects an empty title without issuing a request', async ({ page }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/meetings/new');

    let requestIssued = false;
    await page.route('**/meetings', async (route) => {
      requestIssued = true;
      await route.continue();
    });

    await page
      .getByRole('textbox', { name: 'Date and time' })
      .fill('2026-09-01T10:00');
    await page
      .getByRole('textbox', { name: 'Participants' })
      .fill('alice@example.com');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(page.getByText('Title is required.')).toBeVisible();
    expect(requestIssued).toBe(false);
  });

  // Only the empty case is covered here, not a malformed/out-of-range one
  // (e.g. "2026-02-30T10:00") — Playwright's fill() actively rejects such
  // values on a datetime-local input ("Malformed value"), so there's no way
  // to drive that case through the real UI to begin with.
  test('rejects an empty date without issuing a request', async ({ page }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/meetings/new');

    let requestIssued = false;
    await page.route('**/meetings', async (route) => {
      requestIssued = true;
      await route.continue();
    });

    await page.getByRole('textbox', { name: 'Title' }).fill('E2E Validation');
    await page
      .getByRole('textbox', { name: 'Participants' })
      .fill('alice@example.com');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(page.getByText('Enter a valid date and time.')).toBeVisible();
    expect(requestIssued).toBe(false);
  });

  test('rejects an empty participants list without issuing a request', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/meetings/new');

    let requestIssued = false;
    await page.route('**/meetings', async (route) => {
      requestIssued = true;
      await route.continue();
    });

    await page.getByRole('textbox', { name: 'Title' }).fill('E2E Validation');
    await page
      .getByRole('textbox', { name: 'Date and time' })
      .fill('2026-09-01T10:00');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(
      page.getByText('Add at least one participant email.'),
    ).toBeVisible();
    expect(requestIssued).toBe(false);
  });

  test('rejects an invalid participant email without issuing a request', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/meetings/new');

    let requestIssued = false;
    await page.route('**/meetings', async (route) => {
      requestIssued = true;
      await route.continue();
    });

    await page.getByRole('textbox', { name: 'Title' }).fill('E2E Validation');
    await page
      .getByRole('textbox', { name: 'Date and time' })
      .fill('2026-09-01T10:00');
    await page
      .getByRole('textbox', { name: 'Participants' })
      .fill('not-an-email');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(
      page.getByText(
        'Enter valid participant email addresses, separated by commas.',
      ),
    ).toBeVisible();
    expect(requestIssued).toBe(false);
  });

  test('logs out and redirects to login when the session has expired on submit', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/meetings/new');

    await page.route('**/meetings', async (route) => {
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

    await page.getByRole('textbox', { name: 'Title' }).fill('E2E Validation');
    await page
      .getByRole('textbox', { name: 'Date and time' })
      .fill('2026-09-01T10:00');
    await page
      .getByRole('textbox', { name: 'Participants' })
      .fill('alice@example.com');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(page).toHaveURL('/login');
  });

  test('clears a previous server-side error once the user starts correcting the form', async ({
    page,
  }) => {
    await loginViaUi(page, TEST_USER_EMAIL);
    await page.goto('/meetings/new');

    await page.route('**/meetings', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, message: 'Server error' }),
      });
    });

    await page.getByRole('textbox', { name: 'Title' }).fill('E2E Validation');
    await page
      .getByRole('textbox', { name: 'Date and time' })
      .fill('2026-09-01T10:00');
    await page
      .getByRole('textbox', { name: 'Participants' })
      .fill('alice@example.com');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(page.getByText('Server error')).toBeVisible();

    // Clearing Title makes the field itself invalid, which blocks the next
    // submit attempt client-side before it ever reaches the submit handler
    // — the stale server error from the earlier attempt must not linger
    // alongside the new, unrelated validation message.
    await page.getByRole('textbox', { name: 'Title' }).fill('');
    await page.getByRole('button', { name: 'Create meeting' }).click();

    await expect(page.getByText('Title is required.')).toBeVisible();
    await expect(page.getByText('Server error')).not.toBeVisible();
  });
});
