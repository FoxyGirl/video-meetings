import { NotFoundException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { flattenMeetingFile } from '../../meeting-file-flatten.util';
import { isTranscriptionEnabled } from '../../transcription/whisper.constants';
import { RefreshTranscriptionCommand } from '../refresh-transcription.command';
import { TranscribeMeetingFileCommand } from '../transcribe-meeting-file.command';

interface LockedMeetingRow {
  id: string;
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
    // stale file read. Only "id" is selected here — the full row is fetched
    // below via a type-checked Prisma call instead of a hand-typed raw-SQL
    // shape.
    const { meeting, file } = await this.prisma.$transaction(async (tx) => {
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

      // A refresh discards whatever transcript (if any) belongs to the
      // current run before starting over — same invalidation
      // UploadMeetingFileHandler/DeleteMeetingFileHandler already do on
      // these same three columns.
      const updatedFile = await tx.meetingFile.update({
        where: { id: existingFile.id },
        data: {
          transcriptionStatus: null,
          transcriptionText: null,
          transcriptionUpdatedAt: null,
        },
      });

      const meetingRow = await tx.meeting.findUniqueOrThrow({
        where: { id: meetingId },
      });

      return { meeting: meetingRow, file: updatedFile };
    });

    if (!isTranscriptionEnabled()) {
      return flattenMeetingFile(meeting, file);
    }

    // Same two-step UploadMeetingFileHandler uses: PENDING is its own write
    // (after the transaction above has committed) so the response already
    // reflects it, then the actual job is dispatched without awaiting it —
    // fire-and-forget, per the plan's "Open technical decision". Unlike
    // Upload's own PENDING write, this one is a compare-and-set
    // (updateMany keyed on id + filePath, not a plain update()) — the same
    // guard TranscribeMeetingFileHandler's own PROCESSING/COMPLETED/FAILED
    // writes use (#132): a delete (or replace) landing in the gap between
    // the transaction above committing and this write already superseded
    // this file row, so blindly writing PENDING here would strand it in
    // that status forever — the dispatched job below would just no-op
    // against the stale id and never move it back out. Skip the dispatch
    // too when that happens, since there'd be nothing for it to do.
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
            `[RefreshTranscriptionHandler] failed to dispatch transcription for meeting ${meetingId}:`,
            error,
          );
        });
    }

    // Re-read rather than trust a locally-constructed response — the
    // updateMany above may have no-opped (claimed === 0, e.g. a concurrent
    // delete removed this file row entirely), in which case the true
    // current state (whatever the superseding delete/replace left it as,
    // including no file at all) is what the caller should see, not a
    // fabricated PENDING.
    const currentMeeting = await this.prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      include: { files: true },
    });
    const { files, ...meetingFields } = currentMeeting;

    return flattenMeetingFile(meetingFields, files[0] ?? null);
  }
}
