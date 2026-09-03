import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { getUploadDir } from '../../upload/file-upload.constants';
import { DeleteMeetingCommand } from '../delete-meeting.command';

interface LockedMeetingRow {
  id: string;
}

@CommandHandler(DeleteMeetingCommand)
export class DeleteMeetingHandler implements ICommandHandler<DeleteMeetingCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, organizerId }: DeleteMeetingCommand) {
    const files = await this.prisma.$transaction(async (tx) => {
      // Same lock + ownership shape upload/delete-file/refresh-transcription
      // use: a non-organizer (or nonexistent meeting) gets 404, not 403.
      const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
        SELECT "id" FROM "Meeting"
        WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
        FOR UPDATE
      `;

      if (!lockedMeeting) {
        throw new NotFoundException('Meeting not found');
      }

      // Fetched before delete — the rows (and the filePaths on them) are
      // gone once the cascade below runs.
      const meetingFiles = await tx.meetingFile.findMany({
        where: { meetingId },
      });

      // Cascade (onDelete: Cascade) removes the dependent MeetingFile/
      // ActionItem/Decision rows automatically.
      await tx.meeting.delete({ where: { id: meetingId } });

      return meetingFiles;
    });

    // Clear the DB rows before removing files from disk — a crash between
    // these leaves at worst orphaned files on disk, never a row pointing at
    // a deleted one (same ordering delete-meeting-file's handler uses).
    await Promise.all(
      files.map((file) =>
        unlink(join(getUploadDir(), file.filePath)).catch(() => undefined),
      ),
    );
  }
}
