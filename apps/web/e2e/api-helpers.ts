import type { APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

export const API_URL = process.env.API_URL ?? 'http://localhost:3001';
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/video_meetings';
export const TEST_PASSWORD = 'TestPassword123!';

// Local dev test user — seeded once via POST /auth/register and documented
// in the repo root CLAUDE.md. Re-registering is a no-op (409, ignored).
export const TEST_USER_EMAIL = 'qa-test@video-meetings.local';

export async function registerUserViaApi(
  request: APIRequestContext,
  email: string,
  options: { ignoreConflict?: boolean } = {},
) {
  const res = await request.post(`${API_URL}/auth/register`, {
    data: { email, password: TEST_PASSWORD },
  });
  if (!res.ok() && !(options.ignoreConflict && res.status() === 409)) {
    throw new Error(
      `Failed to provision user via API: ${res.status()} ${await res.text()}`,
    );
  }
}

export async function loginUserViaApi(
  request: APIRequestContext,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to log in user via API: ${res.status()} ${await res.text()}`,
    );
  }
  const { accessToken } = (await res.json()) as { accessToken: string };
  return accessToken;
}

// Deletes a user created for a test directly from Postgres — there is no
// delete-user API endpoint, and these are throwaway accounts scoped to a
// single test run, so talking to the dev database directly (same approach
// apps/api's own e2e suite uses for cleanup) is simpler than adding one.
export async function deleteUserByEmail(email: string) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM "User" WHERE email = $1', [email]);
  } finally {
    await client.end();
  }
}

// Same rationale as deleteUserByEmail — used for meetings seeded under the
// persistent shared test user, which itself is never deleted.
export async function deleteMeetingById(id: string) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM "Meeting" WHERE id = $1', [id]);
  } finally {
    await client.end();
  }
}
