import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { clearMeetingSummary } from '../../summary/clear-meeting-summary';
import { MAX_FILES_PER_MEETING } from '../../upload/file-upload.constants';
import { UploadMeetingFileCommand } from '../upload-meeting-file.command';
import { UploadMeetingFileHandler } from './upload-meeting-file.handler';

jest.mock('../../summary/clear-meeting-summary', () => ({
  clearMeetingSummary: jest.fn(() => Promise.resolve()),
}));

// Isolates this suite from the transcription-dispatch path (PENDING write +
// TranscribeMeetingFileCommand) — exercised by the e2e suite instead.
jest.mock('../../transcription/whisper.constants', () => ({
  isTranscriptionEnabled: () => false,
}));

const mockedClearMeetingSummary = jest.mocked(clearMeetingSummary);

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZER_ID = '33333333-3333-4333-8333-333333333333';

function buildUploadedFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    originalname: 'recording.mp3',
    mimetype: 'audio/mpeg',
    size: 1024,
    filename: 'stored-recording.mp3',
    path: '/tmp/does-not-exist-recording.mp3',
    ...overrides,
  } as Express.Multer.File;
}

describe('UploadMeetingFileHandler', () => {
  let queryRaw: jest.Mock<
    () => Promise<{ id: string; summaryText: string | null }[]>
  >;
  let count: jest.Mock<() => Promise<number>>;
  let create: jest.Mock<
    (args: {
      data: { originalName: string; filePath: string };
    }) => Promise<unknown>
  >;
  let handler: UploadMeetingFileHandler;

  function setLockedMeeting(summaryText: string | null) {
    queryRaw.mockResolvedValue([{ id: MEETING_ID, summaryText }]);
  }

  beforeEach(() => {
    mockedClearMeetingSummary.mockClear();

    queryRaw = jest.fn();
    count = jest.fn(() => Promise.resolve(0));
    create = jest.fn(
      (args: { data: { originalName: string; filePath: string } }) =>
        Promise.resolve({
          id: 'generated-id',
          meetingId: MEETING_ID,
          originalName: args.data.originalName,
          filePath: args.data.filePath,
          mimeType: 'audio/mpeg',
          size: 1024,
          uploadedAt: new Date(),
          transcriptionStatus: null,
          transcriptionText: null,
          transcriptionUpdatedAt: null,
        }),
    );

    const tx = {
      $queryRaw: queryRaw,
      meetingFile: { count, create },
    };

    const prisma = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService;

    handler = new UploadMeetingFileHandler(prisma, {} as unknown as CommandBus);
  });

  it('does not clear the summary when the meeting has none yet', async () => {
    setLockedMeeting(null);

    await handler.execute(
      new UploadMeetingFileCommand(MEETING_ID, ORGANIZER_ID, [
        buildUploadedFile(),
      ]),
    );

    expect(mockedClearMeetingSummary).not.toHaveBeenCalled();
  });

  it('clears the summary when the meeting already has a non-empty one', async () => {
    setLockedMeeting('An existing summary.');

    await handler.execute(
      new UploadMeetingFileCommand(MEETING_ID, ORGANIZER_ID, [
        buildUploadedFile(),
      ]),
    );

    expect(mockedClearMeetingSummary).toHaveBeenCalledWith(
      expect.anything(),
      MEETING_ID,
    );
  });

  it('does not clear the summary when the whole batch is rejected (no file actually added)', async () => {
    setLockedMeeting('An existing summary.');
    // Meeting already at the cap — every type-valid file gets pushed into
    // capRejected instead of created, so nothing about the file set changes.
    count.mockResolvedValue(MAX_FILES_PER_MEETING);

    await handler.execute(
      new UploadMeetingFileCommand(MEETING_ID, ORGANIZER_ID, [
        buildUploadedFile(),
      ]),
    );

    expect(mockedClearMeetingSummary).not.toHaveBeenCalled();
  });

  it('throws 404 for a non-organizer/nonexistent meeting without touching the summary', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(
      handler.execute(
        new UploadMeetingFileCommand(MEETING_ID, ORGANIZER_ID, [
          buildUploadedFile(),
        ]),
      ),
    ).rejects.toThrow(NotFoundException);

    expect(mockedClearMeetingSummary).not.toHaveBeenCalled();
  });
});
