import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { getUploadDir } from '../../upload/file-upload.constants';
import { DeleteMeetingFileCommand } from '../delete-meeting-file.command';

@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, organizerId }: DeleteMeetingFileCommand) {
    // Same ownership-check shape as UploadMeetingFileHandler: a non-organizer
    // (or a nonexistent meeting) gets 404, not 403.
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, organizerId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (!meeting.filePath) {
      throw new NotFoundException('No file exists for this meeting');
    }

    // Clear the row before removing the file from disk — a crash between
    // these leaves at worst an orphaned file, never a row pointing at a
    // deleted one. Same crash-safety ordering as the replace-on-reupload
    // path in UploadMeetingFileHandler.
    const updated = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        fileOriginalName: null,
        filePath: null,
        fileMimeType: null,
        fileSize: null,
        fileUploadedAt: null,
      },
    });

    await unlink(join(getUploadDir(), meeting.filePath)).catch(() => undefined);

    return updated;
  }
}
