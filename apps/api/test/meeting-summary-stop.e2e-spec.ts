import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  jest,
} from '@jest/globals';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { MeetingSummaryResult } from '../src/meetings/summary/parse-meeting-summary-response';
import { getUploadDir } from '../src/meetings/upload/file-upload.constants';

// Same reasoning as meeting-summary-refresh.e2e-spec.ts: exercises the real
// local Whisper engine so files actually reach a terminal
// transcriptionStatus, while the LLM call itself is mocked below.
process.env.TRANSCRIPTION_ENABLED = 'true';
process.env.GEMINI_API_KEY = 'test-key';

const mockGenerateMeetingSummary =
  jest.fn<(transcriptText: string) => Promise<MeetingSummaryResult>>();

jest.mock('../src/meetings/summary/generate-meeting-summary', () => ({
  generateMeetingSummary: (transcriptText: string) =>
    mockGenerateMeetingSummary(transcriptText),
}));

import { AppModule } from './../src/app.module';

// Real inference is fast once the model/binary are warm, but the very first
// call in a freshly-provisioned environment additionally pays for
// nodejs-whisper's one-time model download and CMake build of whisper.cpp —
// see meeting-summary-generation.e2e-spec.ts, which pays the same cost.
jest.setTimeout(10 * 60 * 1000);

const UPLOAD_DIR = getUploadDir();
const FIXTURES_DIR = join(__dirname, 'fixtures');
const SHORT_SPEECH_FIXTURE = join(FIXTURES_DIR, 'short-speech.mp3');
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

const SUMMARY_RESULT: MeetingSummaryResult = {
  summary: 'A summary that should never be persisted after Stop.',
  actionItems: [{ description: 'An action item', assignee: 'Alex' }],
  decisions: ['A decision'],
};

interface AuthResponseBody {
  accessToken: string;
}

type SummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface MeetingFileMetadataBody {
  id: string;
  transcriptionStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null;
}

interface UploadBatchResponseBody {
  accepted: MeetingFileMetadataBody[];
  rejected: { originalName: string; reason: string }[];
}

interface MeetingResponseBody {
  id: string;
  summaryStatus: SummaryStatus | null;
  summaryText: string | null;
  summaryIsPartial: boolean | null;
  actionItems: { id: string; description: string }[];
  decisions: { id: string; description: string }[];
}

// A manually-resolvable promise, so a test can hold one generation's LLM
// call "in flight" while Stop is called against the meeting it belongs to.
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('Meeting summary stop (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `meeting-summary-stop-user-${Date.now()}-${userCounter++}@example.com`;

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
  ): Promise<MeetingFileMetadataBody> {
    const response = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('files', SHORT_SPEECH_FIXTURE, {
        filename: 'short-speech.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(201);

    return (response.body as UploadBatchResponseBody).accepted[0];
  }

  async function stopSummary(
    meetingId: string,
    token: string,
  ): Promise<MeetingResponseBody> {
    const response = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/summary/stop`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return response.body as MeetingResponseBody;
  }

  async function getMeeting(
    meetingId: string,
    token: string,
  ): Promise<MeetingResponseBody> {
    const response = await request(app.getHttpServer())
      .get(`/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return response.body as MeetingResponseBody;
  }

  async function getMeetingFiles(
    meetingId: string,
    token: string,
  ): Promise<MeetingFileMetadataBody[]> {
    const response = await request(app.getHttpServer())
      .get(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return response.body as MeetingFileMetadataBody[];
  }

  // Bounded poll, not a fixed sleep: real inference time varies with
  // whatever else is running on the host.
  async function pollUntilFilesSettled(
    meetingId: string,
    token: string,
    { maxAttempts = 120, intervalMs = 1000 } = {},
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const files = await getMeetingFiles(meetingId, token);

      if (
        files.every(
          (file) =>
            file.transcriptionStatus === 'COMPLETED' ||
            file.transcriptionStatus === 'FAILED',
        )
      ) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Transcription for meeting ${meetingId}'s files did not settle within ${maxAttempts * intervalMs}ms`,
    );
  }

  async function pollUntilSummaryStatus(
    meetingId: string,
    token: string,
    status: SummaryStatus,
    { maxAttempts = 60, intervalMs = 250 } = {},
  ): Promise<MeetingResponseBody> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const meeting = await getMeeting(meetingId, token);

      if (meeting.summaryStatus === status) {
        return meeting;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Summary for meeting ${meetingId} did not reach ${status} within ${maxAttempts * intervalMs}ms`,
    );
  }

  async function pollUntilSummarySettled(
    meetingId: string,
    token: string,
    { maxAttempts = 60, intervalMs = 250 } = {},
  ): Promise<MeetingResponseBody> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const meeting = await getMeeting(meetingId, token);

      if (
        meeting.summaryStatus === 'COMPLETED' ||
        meeting.summaryStatus === 'FAILED'
      ) {
        return meeting;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Summary for meeting ${meetingId} did not settle within ${maxAttempts * intervalMs}ms`,
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

  beforeEach(() => {
    mockGenerateMeetingSummary.mockReset();
  });

  it('stops an in-flight generation, returning the meeting to its pre-generation state, and discards the eventual result', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    const inFlightGeneration = createDeferred<MeetingSummaryResult>();
    mockGenerateMeetingSummary.mockImplementationOnce(
      () => inFlightGeneration.promise,
    );

    await uploadRealSpeech(meetingId, accessToken);
    await pollUntilFilesSettled(meetingId, accessToken);

    // The automatic trigger has claimed PROCESSING (and is now blocked
    // inside the held generateMeetingSummary() call) by the time this
    // resolves — the claim write happens before that call, synchronously.
    await pollUntilSummaryStatus(meetingId, accessToken, 'PROCESSING');

    const stopped = await stopSummary(meetingId, accessToken);
    expect(stopped.summaryStatus).toBeNull();
    expect(stopped.summaryText).toBeNull();
    expect(stopped.actionItems).toEqual([]);
    expect(stopped.decisions).toEqual([]);

    // Only now does the stopped run's LLM call resolve. Its compare-and-set
    // write must find its summaryGenerationToken no longer current and
    // no-op, rather than resurrect the summary Stop just discarded.
    inFlightGeneration.resolve(SUMMARY_RESULT);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const after = await getMeeting(meetingId, accessToken);
    expect(after.summaryStatus).toBeNull();
    expect(after.summaryText).toBeNull();
    expect(after.actionItems).toEqual([]);
    expect(after.decisions).toEqual([]);
  });

  it('leaves a completed summary untouched when there is nothing to stop', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    mockGenerateMeetingSummary.mockResolvedValueOnce(SUMMARY_RESULT);

    await uploadRealSpeech(meetingId, accessToken);
    await pollUntilFilesSettled(meetingId, accessToken);
    const settled = await pollUntilSummarySettled(meetingId, accessToken);
    expect(settled.summaryStatus).toBe('COMPLETED');

    const afterStop = await stopSummary(meetingId, accessToken);
    expect(afterStop.summaryStatus).toBe('COMPLETED');
    expect(afterStop.summaryText).toBe(SUMMARY_RESULT.summary);
    expect(afterStop.actionItems).toHaveLength(1);
    expect(afterStop.decisions).toHaveLength(1);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .post(`/meetings/${NONEXISTENT_ID}/summary/stop`)
      .expect(401);
  });

  it('returns 404 for a meeting that does not exist', async () => {
    const { accessToken } = await registerUser();

    await request(app.getHttpServer())
      .post(`/meetings/${NONEXISTENT_ID}/summary/stop`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('rejects a non-organizer stop request', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const meetingId = await createMeeting(owner.accessToken);

    await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/summary/stop`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
  });
});
