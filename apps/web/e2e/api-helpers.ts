import { randomUUID } from 'node:crypto';
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

export type SeededTranscriptionStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Inserts a MeetingFile row directly, bypassing real upload/Whisper
// transcription entirely — meeting-summary.spec.ts only needs a file in a
// given transcriptionStatus to exercise the summary section's own display
// logic, and driving a real transcription run (meeting-transcription.spec.ts
// already covers that separately) would make these tests slow and, for the
// FAILED case, dependent on ffmpeg's decode-failure behavior rather than on
// what's actually under test here.
export async function seedMeetingFile(
  meetingId: string,
  transcriptionStatus: SeededTranscriptionStatus,
) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "MeetingFile"
         (id, "meetingId", "originalName", "filePath", "mimeType", "size", "uploadedAt", "transcriptionStatus")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [
        randomUUID(),
        meetingId,
        'seeded-recording.mp3',
        `/tmp/seeded-${randomUUID()}.mp3`,
        'audio/mpeg',
        1024,
        transcriptionStatus,
      ],
    );
  } finally {
    await client.end();
  }
}

export interface SeededSummary {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  text?: string;
  isPartial?: boolean;
  actionItems?: { description: string; assignee?: string | null }[];
  decisions?: { description: string }[];
}

// Writes a meeting's summaryStatus/summaryText/summaryIsPartial plus its
// ActionItem/Decision rows directly, the same bypass-the-real-thing
// rationale as seedMeetingFile: real generation calls the Gemini API
// (GEMINI_API_KEY, unset in this dev environment — see apps/api/CLAUDE.md's
// "Meeting summary..." section), so meeting-summary.spec.ts seeds the
// *result* of a generation run directly rather than depending on a real,
// billed network call the suite can't control the content of.
export async function seedMeetingSummary(
  meetingId: string,
  summary: SeededSummary,
) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE "Meeting"
       SET "summaryStatus" = $1, "summaryText" = $2, "summaryIsPartial" = $3, "summaryUpdatedAt" = NOW()
       WHERE id = $4`,
      [
        summary.status,
        summary.text ?? null,
        summary.isPartial ?? false,
        meetingId,
      ],
    );
    for (const [index, item] of (summary.actionItems ?? []).entries()) {
      await client.query(
        `INSERT INTO "ActionItem" (id, "meetingId", description, assignee, "order")
         VALUES ($1, $2, $3, $4, $5)`,
        [
          randomUUID(),
          meetingId,
          item.description,
          item.assignee ?? null,
          index,
        ],
      );
    }
    for (const [index, decision] of (summary.decisions ?? []).entries()) {
      await client.query(
        `INSERT INTO "Decision" (id, "meetingId", description, "order")
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), meetingId, decision.description, index],
      );
    }
  } finally {
    await client.end();
  }
}
