import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { getUploadDir } from '../src/meetings/upload/file-upload.constants';

// Every other api e2e spec uploads synthetic, non-media bytes and would
// otherwise pay for a doomed transcription attempt on every one of their
// upload calls (see apps/api/.env.test) — this is the one spec that
// actually exercises the real local Whisper engine, so it turns the flag
// back on for itself. isTranscriptionEnabled() (whisper.constants.ts) reads
// process.env lazily at call time, not at module-load time, so it's enough
// that this runs before the first real upload below — it doesn't need to
// precede AppModule's own (already-hoisted) import.
process.env.TRANSCRIPTION_ENABLED = 'true';

// Real inference is fast once the model/binary are warm (~2-3s for a clip
// this short), but the very first call in a freshly-provisioned
// environment additionally pays for nodejs-whisper's one-time model
// download and CMake build of whisper.cpp (minutes, not seconds — see
// docs/research-transcribe-uploaded-meeting-files-with-local-whisper.md).
// A generous file-level timeout absorbs that without every other spec
// paying for it.
jest.setTimeout(10 * 60 * 1000);

const UPLOAD_DIR = getUploadDir();
const FIXTURES_DIR = join(__dirname, 'fixtures');
const SHORT_SPEECH_FIXTURE = join(FIXTURES_DIR, 'short-speech.mp3');

interface AuthResponseBody {
  accessToken: string;
}

interface FileMetadataResponseBody {
  transcriptionStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
  transcriptionText: string | null;
}

interface MeetingResponseBody {
  id: string;
  transcriptionStatus: FileMetadataResponseBody['transcriptionStatus'];
}

describe('Meeting file transcription (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `file-transcription-user-${Date.now()}-${userCounter++}@example.com`;

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

  // Bounded poll, not a fixed sleep: real inference time varies with
  // whatever else is running on the host, but this must not hang forever
  // if a regression leaves the status stuck.
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
    if (existsSync(UPLOAD_DIR)) {
      await rm(UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  it('leaves status PENDING right after upload, then reaches COMPLETED with a non-empty transcript', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/file`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', SHORT_SPEECH_FIXTURE, {
        filename: 'short-speech.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(201);

    expect(
      (uploadResponse.body as MeetingResponseBody).transcriptionStatus,
    ).toBe('PENDING');

    const settled = await pollUntilSettled(meetingId, accessToken);

    expect(settled.transcriptionStatus).toBe('COMPLETED');
    expect(settled.transcriptionText).toEqual(expect.any(String));
    expect((settled.transcriptionText ?? '').length).toBeGreaterThan(0);
  });

  it('ends in FAILED for a file that accepted-type validation lets through but has no real media content', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/file`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not a real mp4'), {
        filename: 'not-real.mp4',
        contentType: 'video/mp4',
      })
      .expect(201);

    const settled = await pollUntilSettled(meetingId, accessToken);

    expect(settled.transcriptionStatus).toBe('FAILED');
  });
});
