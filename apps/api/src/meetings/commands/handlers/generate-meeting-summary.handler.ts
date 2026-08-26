import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateMeetingSummary } from '../../summary/generate-meeting-summary';
import { isSummaryGenerationEnabled } from '../../summary/summary.constants';
import { GenerateMeetingSummaryCommand } from '../generate-meeting-summary.command';

@CommandHandler(GenerateMeetingSummaryCommand)
export class GenerateMeetingSummaryHandler implements ICommandHandler<GenerateMeetingSummaryCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId }: GenerateMeetingSummaryCommand) {
    // Same opt-in-by-env-var gate isTranscriptionEnabled() gives Whisper
    // transcription — without a configured GEMINI_API_KEY this is a no-op,
    // leaving summaryStatus exactly as it was (usually still null, the same
    // "not yet applicable" state a meeting with unresolved files is in).
    if (!isSummaryGenerationEnabled()) {
      return;
    }

    // A Meeting has no natural version stamp the way a MeetingFile's
    // filePath acts as one for TranscribeMeetingFileHandler's
    // compare-and-set, so this guard keys off summaryStatus itself. Prisma's
    // `not` filter on a nullable field is null-safe (also matches NULL,
    // unlike raw SQL's three-valued logic), so this claims a meeting
    // generating its summary for the very first time too (summaryStatus
    // still null). Two sibling files finishing near-simultaneously can each
    // independently dispatch this command (maybeTriggerMeetingSummary is
    // safe to call redundantly) — only one concurrent run can win this
    // claim; the other sees claimed === 0 and no-ops.
    const { count: claimed } = await this.prisma.meeting.updateMany({
      where: { id: meetingId, summaryStatus: { not: 'PROCESSING' } },
      data: { summaryStatus: 'PROCESSING' },
    });

    if (claimed === 0) {
      return;
    }

    try {
      const files = await this.prisma.meetingFile.findMany({
        where: { meetingId },
        orderBy: { uploadedAt: 'asc' },
      });

      const completedFiles = files.filter(
        (file) => file.transcriptionStatus === 'COMPLETED',
      );

      if (completedFiles.length === 0) {
        // The trigger (maybeTriggerMeetingSummary) only dispatches once at
        // least one sibling file is COMPLETED, but a concurrent file change
        // between that check and this read could in principle leave none —
        // treated the same as any other generation failure.
        throw new Error(
          `Meeting ${meetingId} has no completed transcripts to summarize.`,
        );
      }

      const transcriptText = completedFiles
        .map((file) => file.transcriptionText ?? '')
        .join('\n\n');

      const result = await generateMeetingSummary(transcriptText);

      // Based on partial input if any sibling file (COMPLETED or not) ended
      // in FAILED — the summary only reflects the completedFiles above, not
      // the meeting's full file set.
      const isPartial = files.some(
        (file) => file.transcriptionStatus === 'FAILED',
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.actionItem.deleteMany({ where: { meetingId } });
        await tx.decision.deleteMany({ where: { meetingId } });

        if (result.actionItems.length > 0) {
          await tx.actionItem.createMany({
            data: result.actionItems.map((item) => ({
              meetingId,
              description: item.description,
              assignee: item.assignee ?? null,
            })),
          });
        }

        if (result.decisions.length > 0) {
          await tx.decision.createMany({
            data: result.decisions.map((description) => ({
              meetingId,
              description,
            })),
          });
        }

        await tx.meeting.update({
          where: { id: meetingId },
          data: {
            summaryStatus: 'COMPLETED',
            summaryText: result.summary,
            summaryIsPartial: isPartial,
            summaryUpdatedAt: new Date(),
          },
        });
      });
    } catch (error) {
      console.error(
        `[GenerateMeetingSummaryHandler] meeting ${meetingId}:`,
        error,
      );

      // Existing summary/action items/decisions (if any, from a prior
      // successful run) are deliberately left untouched — same failure
      // behavior TranscribeMeetingFileHandler gives an existing transcript.
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { summaryStatus: 'FAILED' },
      });
    }
  }
}
