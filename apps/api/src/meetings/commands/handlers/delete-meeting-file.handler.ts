import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { toMeetingFileMetadata } from '../../meeting-file.types';
import { clearMeetingSummary } from '../../summary/clear-meeting-summary';
import { MeetingSummaryTriggerService } from '../../summary/meeting-summary-trigger.service';
import { getUploadDir } from '../../upload/file-upload.constants';
import { DeleteMeetingFileCommand } from '../delete-meeting-file.command';

interface LockedMeetingRow {
  id: string;
  summaryText: string | null;
}

@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<DeleteMeetingFileCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meetingSummaryTrigger: MeetingSummaryTriggerService,
  ) {}

  async execute({ meetingId, fileId, organizerId }: DeleteMeetingFileCommand) {
    const deletedFile = await this.prisma.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE locks the row for the rest of this
      // transaction, so a concurrent upload/reupload/delete on the same
      // meeting serializes against this delete instead of racing on a stale
      // file read. Same ownership-check shape as before: a non-organizer
      // (or a nonexistent meeting) gets 404, not 403.
      const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
        SELECT "id", "summaryText" FROM "Meeting"
        WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
        FOR UPDATE
      `;

      if (!lockedMeeting) {
        throw new NotFoundException('Meeting not found');
      }

      const file = await tx.meetingFile.findUnique({ where: { id: fileId } });

      // Scoped by both fileId and meetingId — a fileId that exists but
      // belongs to a different meeting is treated the same as one that
      // doesn't exist at all, rather than leaking cross-meeting existence.
      if (!file || file.meetingId !== meetingId) {
        throw new NotFoundException('File not found');
      }

      await tx.meetingFile.delete({ where: { id: file.id } });

      // Removing a file changes the transcript set the existing summary was
      // built from — same reset RefreshMeetingSummaryHandler performs, but
      // only when there's actually a non-empty summary to invalidate.
      if (lockedMeeting.summaryText !== null) {
        await clearMeetingSummary(tx, meetingId);
      }

      return file;
    });

    // Clear the row before removing the file from disk — a crash between
    // these leaves at worst an orphaned file, never a row pointing at a
    // deleted one. Every other file on the meeting (and its own
    // transcript) is untouched, since this only ever looks up and deletes
    // the one row matching fileId.
    await unlink(join(getUploadDir(), deletedFile.filePath)).catch(
      () => undefined,
    );

    // Re-runs the same "all files terminal, at least one completed" check
    // the transcription trigger uses — deleting a still-pending/processing
    // file can itself be what makes the remaining file set newly eligible
    // for generation, not just a symptom of invalidation above.
    await this.meetingSummaryTrigger.maybeTrigger(meetingId);

    return toMeetingFileMetadata(deletedFile);
  }
}
