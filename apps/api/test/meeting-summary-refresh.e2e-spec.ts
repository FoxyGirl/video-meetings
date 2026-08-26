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

// Same reasoning as meeting-summary-generation.e2e-spec.ts: exercises the
// real local Whisper engine so files actually reach a terminal
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

// Real inference is fast once the model/binary are warm (~2-3s for a clip
// this short), but the very first call in a freshly-provisioned environment
// additionally pays for nodejs-whisper's one-time model download and CMake
// build of whisper.cpp — see meeting-summary-generation.e2e-spec.ts, which
// pays the same cost.
jest.setTimeout(10 * 60 * 1000);

const UPLOAD_DIR = getUploadDir();
const FIXTURES_DIR = join(__dirname, 'fixtures');
const SHORT_SPEECH_FIXTURE = join(FIXTURES_DIR, 'short-speech.mp3');

const FIRST_SUMMARY_RESULT: MeetingSummaryResult = {
  summary: 'First summary.',
  actionItems: [{ description: 'First action item', assignee: 'Alex' }],
  decisions: ['First decision'],
};

const SECOND_SUMMARY_RESULT: MeetingSummaryResult = {
  summary: 'Second summary.',
  actionItems: [{ description: 'Second action item', assignee: 'Sam' }],
  decisions: ['Second decision'],
};

interface AuthResponseBody {
  accessToken: string;
}

type TranscriptionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type SummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface MeetingFileMetadataBody {
  id: string;
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

// A manually-resolvable promise, so a test can hold one generation's LLM
// call "in flight" while a second, superseding one runs and completes.
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('Meeting summary refresh and invalidation (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `meeting-summary-refresh-user-${Date.now()}-${userCounter++}@example.com`;

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
    filename = 'short-speech.mp3',
  ): Promise<MeetingFileMetadataBody> {
    const response = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('files', SHORT_SPEECH_FIXTURE, {
        filename,
        contentType: 'audio/mpeg',
      })
      .expect(201);

    return (response.body as UploadBatchResponseBody).accepted[0];
  }

  async function deleteFile(
    meetingId: string,
    fileId: string,
    token: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/meetings/${meetingId}/files/${fileId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function refreshSummary(
    meetingId: string,
    token: string,
  ): Promise<MeetingResponseBody> {
    const response = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/summary/refresh`)
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

  async function buildMeetingWithCompletedSummary(
    accessToken: string,
  ): Promise<{ meetingId: string; fileId: string }> {
    const meetingId = await createMeeting(accessToken);
    const file = await uploadRealSpeech(meetingId, accessToken);
    await pollUntilFilesSettled(meetingId, accessToken);
    const meeting = await pollUntilSummarySettled(meetingId, accessToken);
    expect(meeting.summaryStatus).toBe('COMPLETED');
    return { meetingId, fileId: file.id };
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
    mockGenerateMeetingSummary.mockResolvedValue(FIRST_SUMMARY_RESULT);
  });

  it('discards and regenerates an existing summary on refresh', async () => {
    const { accessToken } = await registerUser();
    const { meetingId } = await buildMeetingWithCompletedSummary(accessToken);

    const before = await getMeeting(meetingId, accessToken);
    expect(before.summaryText).toBe(FIRST_SUMMARY_RESULT.summary);

    mockGenerateMeetingSummary.mockResolvedValueOnce(SECOND_SUMMARY_RESULT);

    await refreshSummary(meetingId, accessToken);

    const settled = await pollUntilSummarySettled(meetingId, accessToken);
    expect(settled.summaryStatus).toBe('COMPLETED');
    expect(settled.summaryText).toBe(SECOND_SUMMARY_RESULT.summary);
    expect(settled.actionItems).toEqual([
      expect.objectContaining({
        description: SECOND_SUMMARY_RESULT.actionItems[0].description,
        assignee: SECOND_SUMMARY_RESULT.actionItems[0].assignee,
      }),
    ]);
    expect(settled.decisions).toEqual([
      expect.objectContaining({
        description: SECOND_SUMMARY_RESULT.decisions[0],
      }),
    ]);
    expect(mockGenerateMeetingSummary).toHaveBeenCalledTimes(2);
  });

  it('invalidates an existing summary when a new file is uploaded, and a fresh summary regenerates once it resolves', async () => {
    const { accessToken } = await registerUser();
    const { meetingId } = await buildMeetingWithCompletedSummary(accessToken);

    mockGenerateMeetingSummary.mockResolvedValueOnce(SECOND_SUMMARY_RESULT);

    await uploadRealSpeech(meetingId, accessToken, 'second-file.mp3');

    // The new file isn't terminal yet, so no fresh generation can have
    // fired — but the stale summary must already be gone.
    const invalidated = await getMeeting(meetingId, accessToken);
    expect(invalidated.summaryText).toBeNull();
    expect(invalidated.actionItems).toEqual([]);
    expect(invalidated.decisions).toEqual([]);

    await pollUntilFilesSettled(meetingId, accessToken);
    const settled = await pollUntilSummarySettled(meetingId, accessToken);

    expect(settled.summaryStatus).toBe('COMPLETED');
    expect(settled.summaryText).toBe(SECOND_SUMMARY_RESULT.summary);
    expect(mockGenerateMeetingSummary).toHaveBeenCalledTimes(2);
  });

  it('invalidates an existing summary when a file is deleted, and a fresh summary regenerates once the remaining files resolve', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    // Uploaded and settled one at a time, deliberately: nodejs-whisper's
    // whisper-cli invocation temporarily cd()s the whole process into its
    // own package directory for the duration of a real transcription (see
    // getUploadDir()'s own comment), so two real transcriptions actually
    // running concurrently is its own (pre-existing, unrelated) hazard —
    // sidestepped here by never letting a second real transcription start
    // before the first has already reached a terminal status.
    const firstFile = await uploadRealSpeech(
      meetingId,
      accessToken,
      'first-file.mp3',
    );
    await pollUntilFilesSettled(meetingId, accessToken);
    await pollUntilSummarySettled(meetingId, accessToken);

    const uploadedSecondFile = await uploadRealSpeech(
      meetingId,
      accessToken,
      'second-file.mp3',
    );
    const settledFiles = await pollUntilFilesSettled(meetingId, accessToken);
    const secondFile = settledFiles.find(
      (file) => file.id === uploadedSecondFile.id,
    );
    if (!secondFile) {
      throw new Error('second file missing after settling');
    }
    const initial = await pollUntilSummarySettled(meetingId, accessToken);
    expect(initial.summaryStatus).toBe('COMPLETED');

    // Only interested in what happens from the delete onward — both uploads
    // above already caused their own automatic (re)generation calls.
    mockGenerateMeetingSummary.mockClear();
    mockGenerateMeetingSummary.mockResolvedValueOnce(SECOND_SUMMARY_RESULT);

    await deleteFile(meetingId, firstFile.id, accessToken);

    // The remaining file was already COMPLETED, so this delete alone makes
    // the meeting newly eligible — the stale summary must be gone
    // immediately, whether or not the fresh run has landed yet.
    const invalidated = await getMeeting(meetingId, accessToken);
    expect(invalidated.summaryText).toBeNull();

    const settled = await pollUntilSummarySettled(meetingId, accessToken);
    expect(settled.summaryStatus).toBe('COMPLETED');
    expect(settled.summaryText).toBe(SECOND_SUMMARY_RESULT.summary);
    expect(mockGenerateMeetingSummary).toHaveBeenCalledTimes(1);
    // Only the remaining (second) file's transcript feeds the new run — the
    // deleted file's transcript no longer contributes.
    expect(mockGenerateMeetingSummary.mock.calls[0][0]).toBe(
      secondFile.transcriptionText,
    );
  });

  it("never lets a stale in-flight generation clobber a newer refresh's results", async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    const staleGeneration = createDeferred<MeetingSummaryResult>();
    mockGenerateMeetingSummary.mockImplementationOnce(
      () => staleGeneration.promise,
    );

    await uploadRealSpeech(meetingId, accessToken);
    await pollUntilFilesSettled(meetingId, accessToken);

    // The automatic trigger has claimed PROCESSING (and is now blocked
    // inside the held generateMeetingSummary() call) by the time this
    // resolves — the claim write happens before that call, synchronously.
    await pollUntilSummaryStatus(meetingId, accessToken, 'PROCESSING');

    mockGenerateMeetingSummary.mockResolvedValueOnce(SECOND_SUMMARY_RESULT);
    await refreshSummary(meetingId, accessToken);

    const settled = await pollUntilSummarySettled(meetingId, accessToken);
    expect(settled.summaryStatus).toBe('COMPLETED');
    expect(settled.summaryText).toBe(SECOND_SUMMARY_RESULT.summary);

    // Only now does the superseded run's LLM call resolve. Its
    // compare-and-set write must find its summaryGenerationToken no longer
    // current and no-op, rather than overwrite the newer result.
    staleGeneration.resolve(FIRST_SUMMARY_RESULT);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const final = await getMeeting(meetingId, accessToken);
    expect(final.summaryStatus).toBe('COMPLETED');
    expect(final.summaryText).toBe(SECOND_SUMMARY_RESULT.summary);
    expect(final.actionItems).toEqual([
      expect.objectContaining({
        description: SECOND_SUMMARY_RESULT.actionItems[0].description,
      }),
    ]);
    expect(final.decisions).toEqual([
      expect.objectContaining({
        description: SECOND_SUMMARY_RESULT.decisions[0],
      }),
    ]);
    expect(mockGenerateMeetingSummary).toHaveBeenCalledTimes(2);
  });
});
