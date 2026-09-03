import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { PrismaService } from '../../../prisma/prisma.service';
import { DeleteMeetingCommand } from '../delete-meeting.command';
import { DeleteMeetingHandler } from './delete-meeting.handler';

jest.mock('node:fs/promises', () => ({
  unlink: jest.fn(() => Promise.resolve()),
}));

const mockedUnlink = jest.mocked(unlink);

const MEETING_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZER_ID = '33333333-3333-4333-8333-333333333333';

function buildFile(id: string, filePath: string) {
  return {
    id,
    meetingId: MEETING_ID,
    originalName: `${id}.mp3`,
    filePath,
    mimeType: 'audio/mpeg',
    size: 1024,
    uploadedAt: new Date(),
    transcriptionStatus: null,
    transcriptionText: null,
  };
}

describe('DeleteMeetingHandler', () => {
  let queryRaw: jest.Mock<() => Promise<{ id: string }[]>>;
  let findMany: jest.Mock<() => Promise<ReturnType<typeof buildFile>[]>>;
  let deleteMock: jest.Mock<(args: { where: { id: string } }) => Promise<void>>;
  let handler: DeleteMeetingHandler;

  function setLockedMeeting(found: boolean) {
    queryRaw.mockResolvedValue(found ? [{ id: MEETING_ID }] : []);
  }

  beforeEach(() => {
    mockedUnlink.mockClear();

    queryRaw = jest.fn();
    findMany = jest.fn(() => Promise.resolve([]));
    deleteMock = jest.fn(() => Promise.resolve());

    const tx = {
      $queryRaw: queryRaw,
      meetingFile: { findMany },
      meeting: { delete: deleteMock },
    };

    const prisma = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PrismaService;

    handler = new DeleteMeetingHandler(prisma);
  });

  it('deletes the meeting row and unlinks every one of its files from disk', async () => {
    setLockedMeeting(true);
    findMany.mockResolvedValue([
      buildFile('file-a', 'stored-a.mp3'),
      buildFile('file-b', 'stored-b.mp3'),
    ]);

    await handler.execute(new DeleteMeetingCommand(MEETING_ID, ORGANIZER_ID));

    expect(deleteMock).toHaveBeenCalledWith({ where: { id: MEETING_ID } });
    expect(mockedUnlink).toHaveBeenCalledTimes(2);
    expect(mockedUnlink.mock.calls[0][0]).toEqual(
      expect.stringContaining('stored-a.mp3'),
    );
    expect(mockedUnlink.mock.calls[1][0]).toEqual(
      expect.stringContaining('stored-b.mp3'),
    );
  });

  it('throws 404 for a non-organizer/nonexistent meeting without deleting or unlinking anything', async () => {
    setLockedMeeting(false);

    await expect(
      handler.execute(new DeleteMeetingCommand(MEETING_ID, ORGANIZER_ID)),
    ).rejects.toThrow(NotFoundException);

    expect(deleteMock).not.toHaveBeenCalled();
    expect(mockedUnlink).not.toHaveBeenCalled();
  });

  it('succeeds for a meeting with no files, unlinking nothing', async () => {
    setLockedMeeting(true);
    findMany.mockResolvedValue([]);

    await handler.execute(new DeleteMeetingCommand(MEETING_ID, ORGANIZER_ID));

    expect(deleteMock).toHaveBeenCalledWith({ where: { id: MEETING_ID } });
    expect(mockedUnlink).not.toHaveBeenCalled();
  });
});
