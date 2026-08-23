import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { existsSync } from 'node:fs';
import { copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client';
import { AppModule } from './../src/app.module';
import { getUploadDir } from '../src/meetings/upload/file-upload.constants';

// Same reasoning as meeting-file-transcription.e2e-spec.ts: every other api
// e2e spec uploads synthetic, non-media bytes and leaves TRANSCRIPTION_ENABLED
// off (see apps/api/.env.test); this is the one other spec that exercises
// the real local Whisper engine end to end, so it turns the flag back on for
// itself.
process.env.TRANSCRIPTION_ENABLED = 'true';

// Real inference is fast once the model/binary are warm, but a
// freshly-provisioned environment additionally pays for nodejs-whisper's
// one-time model download and CMake build (minutes, not seconds). A
// generous file-level timeout absorbs that without every other spec paying
// for it.
jest.setTimeout(10 * 60 * 1000);

const UPLOAD_DIR = getUploadDir();
const FIXTURES_DIR = join(__dirname, 'fixtures');
const SHORT_SPEECH_FIXTURE = join(FIXTURES_DIR, 'short-speech.mp3');
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface AuthResponseBody {
  accessToken: string;
}

interface FileMetadataResponseBody {
  transcriptionStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  transcriptionText: string | null;
}

interface MeetingResponseBody {
  id: string;
  filePath: string | null;
  transcriptionStatus: FileMetadataResponseBody['transcriptionStatus'];
}

describe('Refresh Transcription (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `refresh-transcription-user-${Date.now()}-${userCounter++}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Sup3rSecret!' })
      .expect(201);

    return { accessToken: (response.body as AuthResponseBody).accessToken };
  }

  async function createMeeting(token: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sprint Planning',
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        participants: [],
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  async function uploadRealSpeech(
    meetingId: string,
    token: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/file`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', SHORT_SPEECH_FIXTURE, {
        filename: 'short-speech.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(201);
  }

  // Bounded poll, not a fixed sleep: real inference time varies with
  // whatever else is running on the host, but this must not hang forever if
  // a regression leaves the status stuck.
  async function pollUntilSettled(
    meetingId: string,
    token: string,
    { maxAttempts = 120, intervalMs = 1000 } = {},
  ): Promise<FileMetadataResponseBody> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as FileMetadataResponseBody;
      if (
        body.transcriptionStatus === 'COMPLETED' ||
        body.transcriptionStatus === 'FAILED'
      ) {
        return body;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Transcription for meeting ${meetingId} did not settle within ${maxAttempts * intervalMs}ms`,
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (existsSync(UPLOAD_DIR)) {
      await rm(UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .post(`/meetings/${NONEXISTENT_ID}/transcription/refresh`)
      .expect(401);
  });

  it('returns 404 for a meeting that does not exist', async () => {
    const { accessToken } = await registerUser();

    await request(app.getHttpServer())
      .post(`/meetings/${NONEXISTENT_ID}/transcription/refresh`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('rejects a non-organizer refresh', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const meetingId = await createMeeting(owner.accessToken);
    await uploadRealSpeech(meetingId, owner.accessToken);
    await pollUntilSettled(meetingId, owner.accessToken);

    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/transcription/refresh`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
  });

  it('returns 404 when the meeting has no file', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/transcription/refresh`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('resets a COMPLETED transcription to PENDING and reaches COMPLETED again', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);
    await uploadRealSpeech(meetingId, accessToken);

    const firstSettled = await pollUntilSettled(meetingId, accessToken);
    expect(firstSettled.transcriptionStatus).toBe('COMPLETED');

    const refreshResponse = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/transcription/refresh`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      (refreshResponse.body as MeetingResponseBody).transcriptionStatus,
    ).toBe('PENDING');

    const resettled = await pollUntilSettled(meetingId, accessToken);
    expect(resettled.transcriptionStatus).toBe('COMPLETED');
    expect(resettled.transcriptionText).toEqual(expect.any(String));
    expect((resettled.transcriptionText ?? '').length).toBeGreaterThan(0);
  });

  it('retries a FAILED transcription and can reach COMPLETED', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    // Same technique meeting-file-transcription.e2e-spec.ts uses to force a
    // FAILED result: an accepted extension/MIME pair with no real media
    // content behind it.
    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/file`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not a real mp4'), {
        filename: 'not-real.mp4',
        contentType: 'video/mp4',
      })
      .expect(201);

    const firstSettled = await pollUntilSettled(meetingId, accessToken);
    expect(firstSettled.transcriptionStatus).toBe('FAILED');

    // Swap in real audio bytes at the same stored path — a retry re-reads
    // whatever is currently on disk for the file's filePath, it doesn't
    // re-upload, so this is what turns the retry into a success.
    const meetingFile = await prisma.meetingFile.findFirstOrThrow({
      where: { meetingId },
    });
    await copyFile(
      SHORT_SPEECH_FIXTURE,
      join(UPLOAD_DIR, meetingFile.filePath),
    );

    const refreshResponse = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/transcription/refresh`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      (refreshResponse.body as MeetingResponseBody).transcriptionStatus,
    ).toBe('PENDING');

    const resettled = await pollUntilSettled(meetingId, accessToken);
    expect(resettled.transcriptionStatus).toBe('COMPLETED');
    expect((resettled.transcriptionText ?? '').length).toBeGreaterThan(0);
  });

  it('never leaves transcriptionStatus stranded at PENDING when a delete races a refresh', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);
    await uploadRealSpeech(meetingId, accessToken);
    await pollUntilSettled(meetingId, accessToken);

    const [refreshResponse, deleteResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/meetings/${meetingId}/transcription/refresh`)
        .set('Authorization', `Bearer ${accessToken}`),
      request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/file`)
        .set('Authorization', `Bearer ${accessToken}`),
    ]);

    // Whichever of the two took the row lock first: the delete always
    // succeeds (its own SELECT ... FOR UPDATE always finds *some* file to
    // delete — the file was uploaded and settled before the race started),
    // while the refresh either succeeds against the pre-delete file (if it
    // locked first) or gets 404 once the delete has already cleared
    // filePath (if the delete locked first) — same either-order tolerance
    // meeting-file-management.e2e-spec.ts's concurrent delete/re-upload
    // test uses.
    expect(deleteResponse.status).toBe(200);
    expect([200, 404]).toContain(refreshResponse.status);

    // Regardless of ordering, the final state must never be the "impossible"
    // one a missing compare-and-set on the refresh's PENDING write would
    // produce: transcriptionStatus PENDING with no file for anything to
    // ever transcribe (and nothing left to move it out of that status).
    const finalMeeting = (
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
    ).body as MeetingResponseBody;

    expect(finalMeeting.filePath).toBeNull();
    expect(finalMeeting.transcriptionStatus).toBeNull();
  });
});
