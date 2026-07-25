import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UPLOAD_DIR } from '../../upload/file-upload.constants';
import { validateFileType } from '../../upload/validate-file-type';
import { UploadMeetingFileCommand } from '../upload-meeting-file.command';

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<UploadMeetingFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, organizerId, file }: UploadMeetingFileCommand) {
    if (!file) {
      throw new BadRequestException('No file was provided.');
    }

    try {
      // Same ownership-check shape GetMeetingHandler used before Phase 1.
      const meeting = await this.prisma.meeting.findFirst({
        where: { id: meetingId, organizerId },
      });

      if (!meeting) {
        throw new NotFoundException('Meeting not found');
      }

      // Authoritative re-check, on top of the interceptor's fileFilter.
      validateFileType(file.originalname, file.mimetype);

      // Crash-safe replace ordering: the new file is already written to disk
      // (by multer, before this handler ran) and the row is updated to point
      // at it before the old file is deleted. A crash between these leaves
      // at worst an orphaned old file, never a row pointing at a deleted one.
      const updated = await this.prisma.meeting.update({
        where: { id: meetingId },
        data: {
          fileOriginalName: file.originalname,
          filePath: file.filename,
          fileMimeType: file.mimetype,
          fileSize: file.size,
          fileUploadedAt: new Date(),
        },
      });

      if (meeting.filePath) {
        await unlink(join(UPLOAD_DIR, meeting.filePath)).catch(() => undefined);
      }

      return updated;
    } catch (error) {
      // No file should be left on disk in a rejection case.
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }
}
