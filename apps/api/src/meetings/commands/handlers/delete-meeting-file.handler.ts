import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { flattenMeetingFile } from '../../meeting-file-flatten.util';
import { getUploadDir } from '../../upload/file-upload.constants';
import { DeleteMeetingFileCommand } from '../delete-meeting-file.command';

interface LockedMeetingRow {
  id: string;
}

@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, organizerId }: DeleteMeetingFileCommand) {
    const { meeting, deletedFile } = await this.prisma.$transaction(
      async (tx) => {
        // SELECT ... FOR UPDATE locks the row for the rest of this
        // transaction, so a concurrent upload/reupload to the same meeting
        // (which takes the same lock in UploadMeetingFileHandler) serializes
        // against this delete instead of racing on a stale file read —
        // without this, a delete reading the row just before a reupload
        // commits would clear the *new* file's metadata while unlinking the
        // *old* (already-replaced) path, orphaning the new file on disk.
        // Same ownership-check shape as UploadMeetingFileHandler otherwise:
        // a non-organizer (or a nonexistent meeting) gets 404, not 403. Only
        // "id" is selected here — the full row is fetched below via a
        // type-checked Prisma call instead of a hand-typed raw-SQL shape.
        const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
          SELECT "id" FROM "Meeting"
          WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
          FOR UPDATE
        `;

        if (!lockedMeeting) {
          throw new NotFoundException('Meeting not found');
        }

        const existingFile = await tx.meetingFile.findFirst({
          where: { meetingId },
        });

        if (!existingFile) {
          throw new NotFoundException('No file exists for this meeting');
        }

        await tx.meetingFile.delete({ where: { id: existingFile.id } });

        const meetingRow = await tx.meeting.findUniqueOrThrow({
          where: { id: meetingId },
        });

        return { meeting: meetingRow, deletedFile: existingFile };
      },
    );

    // Clear the row before removing the file from disk — a crash between
    // these leaves at worst an orphaned file, never a row pointing at a
    // deleted one. Same crash-safety ordering as the replace-on-reupload
    // path in UploadMeetingFileHandler.
    await unlink(join(getUploadDir(), deletedFile.filePath)).catch(
      () => undefined,
    );

    return flattenMeetingFile(meeting, null);
  }
}
