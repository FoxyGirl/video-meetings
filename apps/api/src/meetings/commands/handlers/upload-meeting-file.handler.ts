import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { getUploadDir } from '../../upload/file-upload.constants';
import { validateFileType } from '../../upload/validate-file-type';
import { UploadMeetingFileCommand } from '../upload-meeting-file.command';

interface LockedMeetingRow {
  id: string;
  filePath: string | null;
}

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<UploadMeetingFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, organizerId, file }: UploadMeetingFileCommand) {
    if (!file) {
      throw new BadRequestException('No file was provided.');
    }

    try {
      // Authoritative re-check, on top of the interceptor's fileFilter.
      validateFileType(file.originalname, file.mimetype);

      const { updated, oldFilePath } = await this.prisma.$transaction(
        async (tx) => {
          // SELECT ... FOR UPDATE locks the row for the rest of this
          // transaction, so a concurrent re-upload to the same meeting
          // blocks here until this one commits, instead of both reading the
          // same "old" filePath and racing on which file gets orphaned.
          // Same ownership shape GetMeetingHandler used before Phase 1.
          const [meeting] = await tx.$queryRaw<LockedMeetingRow[]>`
            SELECT "id", "filePath" FROM "Meeting"
            WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
            FOR UPDATE
          `;

          if (!meeting) {
            throw new NotFoundException('Meeting not found');
          }

          // Crash-safe replace ordering: the new file is already written to
          // disk (by multer, before this handler ran) and the row is
          // updated to point at it before the old file is deleted. A crash
          // between these leaves at worst an orphaned old file, never a row
          // pointing at a deleted one.
          const result = await tx.meeting.update({
            where: { id: meetingId },
            data: {
              fileOriginalName: file.originalname,
              filePath: file.filename,
              fileMimeType: file.mimetype,
              fileSize: file.size,
              fileUploadedAt: new Date(),
            },
          });

          return { updated: result, oldFilePath: meeting.filePath };
        },
      );

      if (oldFilePath) {
        await unlink(join(getUploadDir(), oldFilePath)).catch(() => undefined);
      }

      return updated;
    } catch (error) {
      // No file should be left on disk in a rejection case.
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }
}
