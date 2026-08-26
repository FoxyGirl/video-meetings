import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { clearMeetingSummary } from '../../summary/clear-meeting-summary';
import { MeetingSummaryTriggerService } from '../../summary/meeting-summary-trigger.service';
import { RefreshTranscriptionCommand } from '../refresh-transcription.command';
import { RefreshTranscriptionHandler } from './refresh-transcription.handler';

jest.mock('../../summary/clear-meeting-summary', () => ({
  clearMeetingSummary: jest.fn(() => Promise.resolve()),
}));

// Isolates this suite from the invalidation branch's own logic — the
// PENDING-write/dispatch path once transcription is enabled is exercised by
// the e2e suite instead.
jest.mock('../../transcription/whisper.constants', () => ({
  isTranscriptionEnabled: () => false,
}));

const mockedClearMeetingSummary = jest.mocked(clearMeetingSummary);

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const ORGANIZER_ID = '33333333-3333-4333-8333-333333333333';

interface FileRow {
  id: string;
  meetingId: string;
  originalName: string;
  filePath: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  transcriptionStatus: string | null;
  transcriptionText: string | null;
}

function buildFile(): FileRow {
  return {
    id: FILE_ID,
    meetingId: MEETING_ID,
    originalName: 'recording.mp3',
    filePath: 'stored-recording.mp3',
    mimeType: 'audio/mpeg',
    size: 1024,
    uploadedAt: new Date(),
    transcriptionStatus: null,
    transcriptionText: null,
  };
}

describe('RefreshTranscriptionHandler', () => {
  let queryRaw: jest.Mock<
    () => Promise<{ id: string; summaryText: string | null }[]>
  >;
  let findUnique: jest.Mock<() => Promise<FileRow>>;
  let updateMock: jest.Mock<() => Promise<FileRow>>;
  let maybeTrigger: jest.Mock<(meetingId: string) => Promise<void>>;
  let handler: RefreshTranscriptionHandler;

  function setLockedMeeting(summaryText: string | null) {
    queryRaw.mockResolvedValue([{ id: MEETING_ID, summaryText }]);
  }

  beforeEach(() => {
    mockedClearMeetingSummary.mockClear();

    queryRaw = jest.fn();
    findUnique = jest.fn(() =>
      Promise.resolve({ ...buildFile(), transcriptionStatus: 'FAILED' }),
    );
    updateMock = jest.fn(() => Promise.resolve(buildFile()));
    maybeTrigger = jest.fn(() => Promise.resolve());

    const tx = {
      $queryRaw: queryRaw,
      meetingFile: { findUnique, update: updateMock },
    };

    const prisma = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService;

    handler = new RefreshTranscriptionHandler(
      prisma,
      {} as unknown as CommandBus,
      { maybeTrigger } as unknown as MeetingSummaryTriggerService,
    );
  });

  it('does not clear the summary when the meeting has none yet, but still re-checks the trigger', async () => {
    setLockedMeeting(null);

    await handler.execute(
      new RefreshTranscriptionCommand(MEETING_ID, FILE_ID, ORGANIZER_ID),
    );

    expect(mockedClearMeetingSummary).not.toHaveBeenCalled();
    expect(maybeTrigger).toHaveBeenCalledWith(MEETING_ID);
  });

  it('clears the summary and re-checks the trigger when the meeting already has a non-empty one', async () => {
    setLockedMeeting('An existing summary.');

    await handler.execute(
      new RefreshTranscriptionCommand(MEETING_ID, FILE_ID, ORGANIZER_ID),
    );

    expect(mockedClearMeetingSummary).toHaveBeenCalledWith(
      expect.anything(),
      MEETING_ID,
    );
    expect(maybeTrigger).toHaveBeenCalledWith(MEETING_ID);
  });

  it('throws 404 for a non-organizer/nonexistent meeting without touching the summary', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(
      handler.execute(
        new RefreshTranscriptionCommand(MEETING_ID, FILE_ID, ORGANIZER_ID),
      ),
    ).rejects.toThrow(NotFoundException);

    expect(mockedClearMeetingSummary).not.toHaveBeenCalled();
    expect(maybeTrigger).not.toHaveBeenCalled();
  });
});
