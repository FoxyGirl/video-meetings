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
    // fire-and-forget, per the plan's "Open technical decision".
    const withPendingStatus = await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { transcriptionStatus: 'PENDING' },
    });

    this.commandBus
      .execute(new TranscribeMeetingFileCommand(meetingId, filePath))
      .catch((error: unknown) => {
        console.error(
          `[RefreshTranscriptionHandler] failed to dispatch transcription for meeting ${meetingId}:`,
          error,
        );
      });

    return withPendingStatus;
  }
}
