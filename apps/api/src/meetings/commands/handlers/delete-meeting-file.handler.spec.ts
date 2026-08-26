import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { clearMeetingSummary } from '../../summary/clear-meeting-summary';
import { MeetingSummaryTriggerService } from '../../summary/meeting-summary-trigger.service';
import { DeleteMeetingFileCommand } from '../delete-meeting-file.command';
import { DeleteMeetingFileHandler } from './delete-meeting-file.handler';

jest.mock('../../summary/clear-meeting-summary', () => ({
  clearMeetingSummary: jest.fn(() => Promise.resolve()),
}));

const mockedClearMeetingSummary = jest.mocked(clearMeetingSummary);

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const ORGANIZER_ID = '33333333-3333-4333-8333-333333333333';

function buildFile() {
  return {
    id: FILE_ID,
    meetingId: MEETING_ID,
    originalName: 'recording.mp3',
    filePath: 'stored-recording.mp3',
    mimeType: 'audio/mpeg',
    size: 1024,
    uploadedAt: new Date(),
    transcriptionStatus: 'COMPLETED' as const,
    transcriptionText: 'hello world',
  };
}

describe('DeleteMeetingFileHandler', () => {
  let queryRaw: jest.Mock<
    () => Promise<{ id: string; summaryText: string | null }[]>
  >;
  let findUnique: jest.Mock<() => Promise<ReturnType<typeof buildFile>>>;
  let deleteMock: jest.Mock<() => Promise<void>>;
  let maybeTrigger: jest.Mock<(meetingId: string) => Promise<void>>;
  let handler: DeleteMeetingFileHandler;

  function setLockedMeeting(summaryText: string | null) {
    queryRaw.mockResolvedValue([{ id: MEETING_ID, summaryText }]);
  }

  beforeEach(() => {
    mockedClearMeetingSummary.mockClear();

    queryRaw = jest.fn();
    findUnique = jest.fn(() => Promise.resolve(buildFile()));
    deleteMock = jest.fn(() => Promise.resolve());
    maybeTrigger = jest.fn(() => Promise.resolve());

    const tx = {
      $queryRaw: queryRaw,
      meetingFile: { findUnique, delete: deleteMock },
    };

    const prisma = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService;

    handler = new DeleteMeetingFileHandler(prisma, {
      maybeTrigger,
    } as unknown as MeetingSummaryTriggerService);
  });

  it('does not clear the summary when the meeting has none yet, but still re-checks the trigger', async () => {
    setLockedMeeting(null);

    await handler.execute(
      new DeleteMeetingFileCommand(MEETING_ID, FILE_ID, ORGANIZER_ID),
    );

    expect(mockedClearMeetingSummary).not.toHaveBeenCalled();
    expect(maybeTrigger).toHaveBeenCalledWith(MEETING_ID);
  });

  it('clears the summary and re-checks the trigger when the meeting already has a non-empty one', async () => {
    setLockedMeeting('An existing summary.');

    await handler.execute(
      new DeleteMeetingFileCommand(MEETING_ID, FILE_ID, ORGANIZER_ID),
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
        new DeleteMeetingFileCommand(MEETING_ID, FILE_ID, ORGANIZER_ID),
      ),
    ).rejects.toThrow(NotFoundException);

    expect(mockedClearMeetingSummary).not.toHaveBeenCalled();
    expect(maybeTrigger).not.toHaveBeenCalled();
  });
});
