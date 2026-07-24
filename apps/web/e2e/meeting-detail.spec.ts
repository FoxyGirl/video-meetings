import { test, expect, type APIRequestContext } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

// Local dev test user — seeded once via POST /auth/register and documented
// in the repo root CLAUDE.md. Re-registering is a no-op (409, ignored).
const TEST_USER_EMAIL = 'qa-test@video-meetings.local';
const TEST_USER_PASSWORD = 'TestPassword123!';

async function ensureTestUserExists(request: APIRequestContext) {
  const res = await request.post(`${API_URL}/auth/register`, {
    data: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
  });
  if (!res.ok() && res.status() !== 409) {
    throw new Error(
      `Failed to provision test user: ${res.status()} ${await res.text()}`,
    );
  }
}

async function loginTestUser(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to log in test user: ${res.status()} ${await res.text()}`,
    );
  }
  const { accessToken } = (await res.json()) as { accessToken: string };
  return accessToken;
}

test.describe('shared meeting detail page', () => {
  let meetingId: string;
  let meetingTitle: string;

  test.beforeAll(async ({ request }) => {
    await ensureTestUserExists(request);
    const accessToken = await loginTestUser(request);

    meetingTitle = `E2E Meeting ${Date.now()}`;
    const res = await request.post(`${API_URL}/meetings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        title: meetingTitle,
        date: '2026-08-01T15:00:00.000Z',
        participants: ['alice@example.com', 'bob@example.com'],
      },
    });
    if (!res.ok()) {
      throw new Error(
        `Failed to create test meeting: ${res.status()} ${await res.text()}`,
      );
    }
    ({ id: meetingId } = (await res.json()) as { id: string });
  });

  test('organizer can sign in and view their meeting details', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email*' }).fill(TEST_USER_EMAIL);
    await page
      .getByRole('textbox', { name: 'Password*' })
      .fill(TEST_USER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/');
    await page.locator(`a[href="/meetings/${meetingId}"]`).first().click();

    await expect(page).toHaveURL(`/meetings/${meetingId}`);
    await expect(
      page.getByRole('heading', { name: meetingTitle }),
    ).toBeVisible();
    await expect(
      page.getByText('You are the organizer of this meeting.'),
    ).toBeVisible();
    await expect(
      page.getByText('alice@example.com, bob@example.com'),
    ).toBeVisible();
  });

  test('redirects unauthenticated visitors to the login page', async ({
    page,
  }) => {
    await page.goto(`/meetings/${meetingId}`);
    await expect(page).toHaveURL('/login');
  });
});
