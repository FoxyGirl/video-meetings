import { NotFoundException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { isTranscriptionEnabled } from '../../transcription/whisper.constants';
import { RefreshTranscriptionCommand } from '../refresh-transcription.command';
import { TranscribeMeetingFileCommand } from '../transcribe-meeting-file.command';

interface LockedMeetingRow {
  id: string;
  filePath: string | null;
}

@CommandHandler(RefreshTranscriptionCommand)
export class RefreshTranscriptionHandler implements ICommandHandler<RefreshTranscriptionCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute({ meetingId, organizerId }: RefreshTranscriptionCommand) {
    // Same lock + ownership shape UploadMeetingFileHandler/
    // DeleteMeetingFileHandler use: a non-organizer (or nonexistent meeting)
    // gets 404, not 403, and the row lock serializes this against a
    // concurrent upload/delete on the same meeting instead of racing on a
    // stale filePath read.
    const { updated, filePath } = await this.prisma.$transaction(async (tx) => {
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

      // A refresh discards whatever transcript (if any) belongs to the
      // current run before starting over — same invalidation
      // UploadMeetingFileHandler/DeleteMeetingFileHandler already do on
      // these same three columns.
      const result = await tx.meeting.update({
        where: { id: meetingId },
        data: {
          transcriptionStatus: null,
          transcriptionText: null,
          transcriptionUpdatedAt: null,
        },
      });

      return { updated: result, filePath: meeting.filePath };
    });

    if (!isTranscriptionEnabled()) {
      return updated;
    }

    // Same two-step UploadMeetingFileHandler uses: PENDING is its own write
    // (after the transaction above has committed) so the response already
    // reflects it, then the actual job is dispatched without awaiting it —
    // fire-and-forget, per the plan's "Open technical decision". Unlike
    // Upload's own PENDING write, this one is a compare-and-set
    // (updateMany keyed on id + filePath, not a plain update()) — the same
    // guard TranscribeMeetingFileHandler's own PROCESSING/COMPLETED/FAILED
    // writes use (#132): a delete (or replace) landing in the gap between
    // the transaction above committing and this write already moved the
    // meeting on to a different (or no) file, so blindly writing PENDING
    // here would strand it in that status forever — the dispatched job
    // below would just no-op against the stale filePath and never move it
    // back out. Skip the dispatch too when that happens, since there'd be
    // nothing for it to do.
    const { count: claimed } = await this.prisma.meeting.updateMany({
      where: { id: meetingId, filePath },
      data: { transcriptionStatus: 'PENDING' },
    });

    if (claimed > 0) {
      this.commandBus
        .execute(new TranscribeMeetingFileCommand(meetingId, filePath))
        .catch((error: unknown) => {
          console.error(
            `[RefreshTranscriptionHandler] failed to dispatch transcription for meeting ${meetingId}:`,
            error,
          );
        });
    }

    // Re-read rather than trust a locally-constructed response — the
    // updateMany above may have no-opped (claimed === 0), in which case the
    // true current row (whatever the superseding delete/replace left it as)
    // is what the caller should see, not a fabricated PENDING.
    return this.prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
    });
  }
}
