import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerateMeetingSummaryCommand } from '../commands/generate-meeting-summary.command';

// Called after every terminal per-file transcription write (success or
// failure) lands. Re-reads all of the meeting's sibling MeetingFile rows and,
// if every one is now terminal (COMPLETED/FAILED) and at least one is
// COMPLETED, dispatches GenerateMeetingSummaryCommand fire-and-forget — same
// .catch()-logged, non-awaited dispatch style the transcription handlers
// already use. Safe to call redundantly: two files finishing near-
// simultaneously can each independently observe "all terminal" and each call
// this; GenerateMeetingSummaryHandler's own compare-and-set write makes a
// double-dispatch harmless.
export async function maybeTriggerMeetingSummary(
  prisma: PrismaService,
  commandBus: CommandBus,
  meetingId: string,
): Promise<void> {
  const files = await prisma.meetingFile.findMany({
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

  // Written synchronously so a client polling right after this fires can
  // observe an intermediate "Pending" state, same as UploadMeetingFileHandler
  // writes transcriptionStatus: 'PENDING' before dispatching
  // TranscribeMeetingFileCommand. Guarded the same null-safe way
  // GenerateMeetingSummaryHandler's own PROCESSING claim is (Prisma's `not`
  // filter never matches NULL) so this never disturbs a run that already
  // claimed PROCESSING.
  await prisma.meeting.updateMany({
    where: {
      id: meetingId,
      OR: [{ summaryStatus: null }, { summaryStatus: { not: 'PROCESSING' } }],
    },
    data: { summaryStatus: 'PENDING' },
  });

  commandBus
    .execute(new GenerateMeetingSummaryCommand(meetingId))
    .catch((error: unknown) => {
      console.error(
        `[maybeTriggerMeetingSummary] failed to dispatch summary generation for meeting ${meetingId}:`,
        error,
      );
    });
}
