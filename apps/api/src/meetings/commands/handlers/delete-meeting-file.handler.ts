import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { getUploadDir } from '../../upload/file-upload.constants';
import { DeleteMeetingFileCommand } from '../delete-meeting-file.command';

interface LockedMeetingRow {
  id: string;
  filePath: string | null;
}

@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, organizerId }: DeleteMeetingFileCommand) {
    const { updated, filePath } = await this.prisma.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE locks the row for the rest of this
      // transaction, so a concurrent upload/reupload to the same meeting
      // (which takes the same lock in UploadMeetingFileHandler) serializes
      // against this delete instead of racing on a stale filePath read —
      // without this, a delete reading the row just before a reupload
      // commits would clear the *new* file's metadata while unlinking the
      // *old* (already-replaced) path, orphaning the new file on disk.
      // Same ownership-check shape as UploadMeetingFileHandler otherwise:
      // a non-organizer (or a nonexistent meeting) gets 404, not 403.
      const [meeting] = await tx.$queryRaw<LockedMeetingRow[]>`
          SELECT "id", "filePath" FROM "Meeting"
          WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
          FOR UPDATE
        `;

      if (!meeting) {
        throw new NotFoundException('Meeting not found');
      }

      if (!meeting.filePath) {
        throw new NotFoundException('No file exists for this meeting');
      }

      const result = await tx.meeting.update({
        where: { id: meetingId },
        data: {
          fileOriginalName: null,
          filePath: null,
          fileMimeType: null,
          fileSize: null,
          fileUploadedAt: null,
        },
      });

      return { updated: result, filePath: meeting.filePath };
    });

    // Clear the row before removing the file from disk — a crash between
    // these leaves at worst an orphaned file, never a row pointing at a
    // deleted one. Same crash-safety ordering as the replace-on-reupload
    // path in UploadMeetingFileHandler.
    await unlink(join(getUploadDir(), filePath)).catch(() => undefined);

    return updated;
  }
}
