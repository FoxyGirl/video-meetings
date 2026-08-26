import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerateMeetingSummaryCommand } from '../commands/generate-meeting-summary.command';

@Injectable()
export class MeetingSummaryTriggerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  // Called after every terminal per-file transcription write (success or
  // failure) lands. Re-reads all of the meeting's sibling MeetingFile rows
  // and, if every one is now terminal (COMPLETED/FAILED) and at least one is
  // COMPLETED, dispatches GenerateMeetingSummaryCommand fire-and-forget —
  // same .catch()-logged, non-awaited dispatch style the transcription
  // handlers already use. Safe to call redundantly: two files finishing
  // near-simultaneously can each independently observe "all terminal" and
  // each call this; GenerateMeetingSummaryHandler's own compare-and-set
  // write makes a double-dispatch harmless.
  async maybeTrigger(meetingId: string): Promise<void> {
    const files = await this.prisma.meetingFile.findMany({
      where: { meetingId },
      select: { transcriptionStatus: true },
    });

    const allTerminal = files.every(
      (file) =>
        file.transcriptionStatus === 'COMPLETED' ||
        file.transcriptionStatus === 'FAILED',
    );
    const anyCompleted = files.some(
      (file) => file.transcriptionStatus === 'COMPLETED',
    );

    if (!allTerminal || !anyCompleted) {
      return;
    }

    // A fresh token per trigger call, stamped alongside PENDING, is what
    // GenerateMeetingSummaryHandler's writes later compare-and-set against —
    // if a refresh/invalidation clears it (or a later trigger overwrites it)
    // before this run's writes land, they'll target a token the row no
    // longer carries and silently no-op instead of clobbering newer results.
    const token = randomUUID();

    // Written synchronously so a client polling right after this fires can
    // observe an intermediate "Pending" state, same as
    // UploadMeetingFileHandler writes transcriptionStatus: 'PENDING' before
    // dispatching TranscribeMeetingFileCommand. Guarded the same null-safe
    // way GenerateMeetingSummaryHandler's own PROCESSING claim is (Prisma's
    // `not` filter never matches NULL) so this never disturbs a run that
    // already claimed PROCESSING — in that case the token/status are left
    // untouched, and the redundant dispatch below carries a token the row
    // will never carry, so it harmlessly no-ops instead of racing the
    // in-flight run.
    await this.prisma.meeting.updateMany({
      where: {
        id: meetingId,
        OR: [{ summaryStatus: null }, { summaryStatus: { not: 'PROCESSING' } }],
      },
      data: { summaryStatus: 'PENDING', summaryGenerationToken: token },
    });

    this.commandBus
      .execute(new GenerateMeetingSummaryCommand(meetingId, token))
      .catch((error: unknown) => {
        console.error(
          `[MeetingSummaryTriggerService] failed to dispatch summary generation for meeting ${meetingId}:`,
          error,
        );
      });
  }
}
