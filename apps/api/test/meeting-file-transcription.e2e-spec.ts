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

type TranscriptionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface MeetingFileMetadataBody {
  id: string;
  originalName: string;
  transcriptionStatus: TranscriptionStatus | null;
  transcriptionText: string | null;
}

interface UploadBatchResponseBody {
  accepted: MeetingFileMetadataBody[];
  rejected: { originalName: string; reason: string }[];
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

  async function uploadFile(
    meetingId: string,
    token: string,
    options: { path?: string; buffer?: Buffer; filename: string },
  ): Promise<MeetingFileMetadataBody> {
    const req = request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`);

    const response = await (
      options.path
        ? req.attach('files', options.path, {
            filename: options.filename,
            contentType: 'audio/mpeg',
          })
        : req.attach('files', options.buffer as Buffer, {
            filename: options.filename,
            contentType: 'video/mp4',
          })
    ).expect(201);

    return (response.body as UploadBatchResponseBody).accepted[0];
  }

  async function getFile(
    meetingId: string,
    fileId: string,
    token: string,
  ): Promise<MeetingFileMetadataBody> {
    const response = await request(app.getHttpServer())
      .get(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const files = response.body as MeetingFileMetadataBody[];
    const file = files.find((f) => f.id === fileId);

    if (!file) {
      throw new Error(`File ${fileId} not found on meeting ${meetingId}`);
    }

    return file;
  }

  // Bounded poll, not a fixed sleep: real inference time varies with
  // whatever else is running on the host, but this must not hang forever
  // if a regression leaves the status stuck.
  async function pollUntilSettled(
    meetingId: string,
    fileId: string,
    token: string,
    { maxAttempts = 120, intervalMs = 1000 } = {},
  ): Promise<MeetingFileMetadataBody> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const file = await getFile(meetingId, fileId, token);

      if (
        file.transcriptionStatus === 'COMPLETED' ||
        file.transcriptionStatus === 'FAILED'
      ) {
        return file;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Transcription for file ${fileId} did not settle within ${maxAttempts * intervalMs}ms`,
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

    const uploaded = await uploadFile(meetingId, accessToken, {
      path: SHORT_SPEECH_FIXTURE,
      filename: 'short-speech.mp3',
    });

    expect(uploaded.transcriptionStatus).toBe('PENDING');

    const settled = await pollUntilSettled(meetingId, uploaded.id, accessToken);

    expect(settled.transcriptionStatus).toBe('COMPLETED');
    expect(settled.transcriptionText).toEqual(expect.any(String));
    expect((settled.transcriptionText ?? '').length).toBeGreaterThan(0);
  });

  it('ends in FAILED for a file that accepted-type validation lets through but has no real media content', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    const uploaded = await uploadFile(meetingId, accessToken, {
      buffer: Buffer.from('not a real mp4'),
      filename: 'not-real.mp4',
    });

    const settled = await pollUntilSettled(meetingId, uploaded.id, accessToken);

    expect(settled.transcriptionStatus).toBe('FAILED');
  });
});
