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

// Exercises the real local Whisper engine (same as
// meeting-file-transcription.e2e-spec.ts) so the meeting's files actually
// reach a terminal transcriptionStatus and the "all files terminal" trigger
// (maybeTriggerMeetingSummary) has something real to observe.
process.env.TRANSCRIPTION_ENABLED = 'true';
// isSummaryGenerationEnabled() (src/meetings/summary/summary.constants.ts)
// gates purely on this being set — a dummy value is enough to satisfy that
// gate, since the actual Gemini call is mocked below rather than made for
// real (no free-tier key or network access needed to run this suite).
process.env.GEMINI_API_KEY = 'test-key';

const mockGenerateMeetingSummary =
  jest.fn<(transcriptText: string) => Promise<MeetingSummaryResult>>();

jest.mock('../src/meetings/summary/generate-meeting-summary', () => ({
  generateMeetingSummary: (transcriptText: string) =>
    mockGenerateMeetingSummary(transcriptText),
}));

import { AppModule } from './../src/app.module';

// Real inference is fast once the model/binary are warm (~2-3s for a clip
// this short), but the very first call in a freshly-provisioned environment
// additionally pays for nodejs-whisper's one-time model download and CMake
// build of whisper.cpp (minutes, not seconds) — see
// meeting-file-transcription.e2e-spec.ts, which pays the same cost.
jest.setTimeout(10 * 60 * 1000);

const UPLOAD_DIR = getUploadDir();
const FIXTURES_DIR = join(__dirname, 'fixtures');
const SHORT_SPEECH_FIXTURE = join(FIXTURES_DIR, 'short-speech.mp3');

const DEFAULT_SUMMARY_RESULT: MeetingSummaryResult = {
  summary: 'The team reviewed the sprint plan and agreed on next steps.',
  actionItems: [{ description: 'Draft the sprint plan doc', assignee: 'Alex' }],
  decisions: ['Adopt the two-week sprint cadence'],
};

interface AuthResponseBody {
  accessToken: string;
}

type TranscriptionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type SummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

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

interface ActionItemBody {
  id: string;
  description: string;
  assignee: string | null;
}

interface DecisionBody {
  id: string;
  description: string;
}

interface MeetingResponseBody {
  id: string;
  summaryStatus: SummaryStatus | null;
  summaryText: string | null;
  summaryIsPartial: boolean | null;
  actionItems: ActionItemBody[];
  decisions: DecisionBody[];
}

describe('Meeting summary generation (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `meeting-summary-user-${Date.now()}-${userCounter++}@example.com`;

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

  async function uploadFiles(
    meetingId: string,
    token: string,
    files: { path?: string; buffer?: Buffer; filename: string }[],
  ): Promise<MeetingFileMetadataBody[]> {
    let req = request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`);

    for (const file of files) {
      req = file.path
        ? req.attach('files', file.path, {
            filename: file.filename,
            contentType: 'audio/mpeg',
          })
        : req.attach('files', file.buffer as Buffer, {
            filename: file.filename,
            contentType: 'video/mp4',
          });
    }

    const response = await req.expect(201);

    return (response.body as UploadBatchResponseBody).accepted;
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

  // Bounded poll, not a fixed sleep: real inference time varies with
  // whatever else is running on the host, but this must not hang forever if
  // a regression leaves a file's status stuck.
  async function pollUntilFilesSettled(
    meetingId: string,
    token: string,
    { maxAttempts = 120, intervalMs = 1000 } = {},
  ): Promise<MeetingFileMetadataBody[]> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const files = await getMeetingFiles(meetingId, token);

      if (
        files.every(
          (file) =>
            file.transcriptionStatus === 'COMPLETED' ||
            file.transcriptionStatus === 'FAILED',
        )
      ) {
        return files;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Transcription for meeting ${meetingId}'s files did not settle within ${maxAttempts * intervalMs}ms`,
    );
  }

  // The mocked generateMeetingSummary resolves near-instantly (no real
  // network latency), so this only needs to absorb the in-process CQRS
  // dispatch + a couple of DB round trips.
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
    mockGenerateMeetingSummary.mockResolvedValue(DEFAULT_SUMMARY_RESULT);
  });

  it("generates a summary automatically once the meeting's only file completes transcription", async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    await uploadFiles(meetingId, accessToken, [
      { path: SHORT_SPEECH_FIXTURE, filename: 'short-speech.mp3' },
    ]);

    const settledFiles = await pollUntilFilesSettled(meetingId, accessToken);
    expect(settledFiles[0].transcriptionStatus).toBe('COMPLETED');

    const meeting = await pollUntilSummarySettled(meetingId, accessToken);

    expect(meeting.summaryStatus).toBe('COMPLETED');
    expect(meeting.summaryText).toBe(DEFAULT_SUMMARY_RESULT.summary);
    expect(meeting.summaryIsPartial).toBe(false);
    expect(meeting.actionItems).toEqual([
      expect.objectContaining({
        description: DEFAULT_SUMMARY_RESULT.actionItems[0].description,
        assignee: DEFAULT_SUMMARY_RESULT.actionItems[0].assignee,
      }),
    ]);
    expect(meeting.decisions).toEqual([
      expect.objectContaining({
        description: DEFAULT_SUMMARY_RESULT.decisions[0],
      }),
    ]);

    expect(mockGenerateMeetingSummary).toHaveBeenCalledTimes(1);
    const [transcriptArg] = mockGenerateMeetingSummary.mock.calls[0];
    expect(transcriptArg).toBe(settledFiles[0].transcriptionText);
  });

  it("generates a partial summary when only some of the meeting's files complete transcription", async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    await uploadFiles(meetingId, accessToken, [
      { path: SHORT_SPEECH_FIXTURE, filename: 'real-speech.mp3' },
      { buffer: Buffer.from('not a real mp4'), filename: 'not-real.mp4' },
    ]);

    const settledFiles = await pollUntilFilesSettled(meetingId, accessToken);
    const completedFile = settledFiles.find(
      (file) => file.transcriptionStatus === 'COMPLETED',
    );
    const failedFile = settledFiles.find(
      (file) => file.transcriptionStatus === 'FAILED',
    );
    expect(completedFile).toBeDefined();
    expect(failedFile).toBeDefined();

    const meeting = await pollUntilSummarySettled(meetingId, accessToken);

    expect(meeting.summaryStatus).toBe('COMPLETED');
    expect(meeting.summaryIsPartial).toBe(true);

    // Only the completed file's transcript is sent for generation — the
    // failed file contributes nothing to the combined input.
    expect(mockGenerateMeetingSummary).toHaveBeenCalledTimes(1);
    const [transcriptArg] = mockGenerateMeetingSummary.mock.calls[0];
    expect(transcriptArg).toBe(completedFile?.transcriptionText);
  });

  it('never attempts generation when every file fails transcription', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    await uploadFiles(meetingId, accessToken, [
      { buffer: Buffer.from('not a real mp4'), filename: 'not-real.mp4' },
    ]);

    const settledFiles = await pollUntilFilesSettled(meetingId, accessToken);
    expect(settledFiles[0].transcriptionStatus).toBe('FAILED');

    // Give any (incorrectly) dispatched generation a moment to land before
    // asserting its absence — a bounded grace period, not a fixed sleep
    // this suite relies on for its actual pass condition.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const meeting = await getMeeting(meetingId, accessToken);

    expect(meeting.summaryStatus).toBeNull();
    expect(meeting.summaryText).toBeNull();
    expect(meeting.actionItems).toEqual([]);
    expect(meeting.decisions).toEqual([]);
    expect(mockGenerateMeetingSummary).not.toHaveBeenCalled();
  });

  it('never re-triggers generation just from viewing the meeting', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    await uploadFiles(meetingId, accessToken, [
      { path: SHORT_SPEECH_FIXTURE, filename: 'short-speech.mp3' },
    ]);

    await pollUntilFilesSettled(meetingId, accessToken);
    const settled = await pollUntilSummarySettled(meetingId, accessToken);
    expect(settled.summaryStatus).toBe('COMPLETED');
    expect(mockGenerateMeetingSummary).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i++) {
      const meeting = await getMeeting(meetingId, accessToken);
      expect(meeting.summaryStatus).toBe('COMPLETED');
      expect(meeting.summaryText).toBe(settled.summaryText);
    }

    expect(mockGenerateMeetingSummary).toHaveBeenCalledTimes(1);
  });
});
