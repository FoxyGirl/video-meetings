import { NotFoundException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { toMeetingFileMetadata } from '../../meeting-file.types';
import { clearMeetingSummary } from '../../summary/clear-meeting-summary';
import { isTranscriptionEnabled } from '../../transcription/whisper.constants';
import { RefreshTranscriptionCommand } from '../refresh-transcription.command';
import { TranscribeMeetingFileCommand } from '../transcribe-meeting-file.command';

interface LockedMeetingRow {
  id: string;
  summaryText: string | null;
}

@CommandHandler(RefreshTranscriptionCommand)
export class RefreshTranscriptionHandler implements ICommandHandler<RefreshTranscriptionCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute({
    meetingId,
    fileId,
    organizerId,
  }: RefreshTranscriptionCommand) {
    // Same lock + ownership shape upload/delete use: a non-organizer (or
    // nonexistent meeting) gets 404, not 403. Scoped by both fileId and
    // meetingId, same as DeleteMeetingFileHandler — refreshing one file
    // never touches any other file's row, on this meeting or another.
    const file = await this.prisma.$transaction(async (tx) => {
      const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
        SELECT "id", "summaryText" FROM "Meeting"
        WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
        FOR UPDATE
      `;

      if (!lockedMeeting) {
        throw new NotFoundException('Meeting not found');
      }

      const existingFile = await tx.meetingFile.findUnique({
        where: { id: fileId },
      });

      if (!existingFile || existingFile.meetingId !== meetingId) {
        throw new NotFoundException('File not found');
      }

      // A refresh discards whatever transcript (if any) belongs to the
      // current run before starting over — same invalidation upload/delete
      // already achieve on these same three columns.
      const refreshedFile = await tx.meetingFile.update({
        where: { id: existingFile.id },
        data: {
          transcriptionStatus: null,
          transcriptionText: null,
          transcriptionUpdatedAt: null,
        },
      });

      // Re-transcribing this file changes the transcript set the existing
      // summary was built from — same reset RefreshMeetingSummaryHandler
      // performs, but only when there's actually a non-empty summary to
      // invalidate.
      if (lockedMeeting.summaryText !== null) {
        await clearMeetingSummary(tx, meetingId);
      }

      return refreshedFile;
    });

    // No maybeTrigger() re-check here, unlike Delete: this file's own
    // transcriptionStatus was just reset to null above (PENDING isn't
    // written until below), so the "all files terminal" check would always
    // see this meeting as not-yet-resolved regardless of any sibling file's
    // state — checking now can never do anything. TranscribeMeetingFileHandler
    // already calls maybeTrigger() itself once this file's re-transcription
    // reaches a terminal state, which is what actually re-triggers
    // generation once the refresh resolves.

    if (!isTranscriptionEnabled()) {
      return toMeetingFileMetadata(file);
    }

    // Same two-step upload uses: PENDING is its own write (after the
    // transaction above has committed) so the response already reflects
    // it, then the actual job is dispatched without awaiting it —
    // fire-and-forget. This is a compare-and-set (updateMany keyed on id +
    // filePath, not a plain update()) — the same guard
    // TranscribeMeetingFileHandler's own writes use: a delete landing in
    // the gap between the transaction above committing and this write
    // already superseded this file row, so blindly writing PENDING here
    // would strand it in that status forever. Skip the dispatch too when
    // that happens, since there'd be nothing for it to do.
    const { count: claimed } = await this.prisma.meetingFile.updateMany({
      where: { id: file.id, filePath: file.filePath },
      data: { transcriptionStatus: 'PENDING' },
    });

    if (claimed > 0) {
      this.commandBus
        .execute(
          new TranscribeMeetingFileCommand(meetingId, file.id, file.filePath),
        )
        .catch((error: unknown) => {
          console.error(
            `[RefreshTranscriptionHandler] failed to dispatch transcription for meeting ${meetingId}, file ${file.id}:`,
            error,
          );
        });
    }

    // Re-read rather than trust a locally-constructed response — the
    // updateMany above may have no-opped (claimed === 0, e.g. a concurrent
    // delete removed this file row entirely), in which case the file
    // genuinely no longer exists.
    const currentFile = await this.prisma.meetingFile.findUnique({
      where: { id: fileId },
    });

    if (!currentFile) {
      throw new NotFoundException('File not found');
    }

    return toMeetingFileMetadata(currentFile);
  }
}
