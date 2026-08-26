import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateMeetingSummary } from '../../summary/generate-meeting-summary';
import { isSummaryGenerationEnabled } from '../../summary/summary.constants';
import { GenerateMeetingSummaryCommand } from '../generate-meeting-summary.command';

@CommandHandler(GenerateMeetingSummaryCommand)
export class GenerateMeetingSummaryHandler implements ICommandHandler<GenerateMeetingSummaryCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, token }: GenerateMeetingSummaryCommand) {
    // Same opt-in-by-env-var gate isTranscriptionEnabled() gives Whisper
    // transcription — without a configured GEMINI_API_KEY this is a no-op,
    // leaving summaryStatus exactly as it was (usually still null, the same
    // "not yet applicable" state a meeting with unresolved files is in).
    if (!isSummaryGenerationEnabled()) {
      return;
    }

    // Keyed on both id + summaryGenerationToken — analogous to
    // TranscribeMeetingFileHandler's updateMany keyed on id + filePath.
    // The token match guards against a run superseded by a refresh/
    // invalidation before it even claims PROCESSING (the trigger would have
    // overwritten the row's token, so this one's updateMany matches zero
    // rows). The summaryStatus OR-guard is the same one Phase 1 used before
    // the token existed: Prisma's `not` filter on a nullable column compiles
    // to a raw SQL `<>`, which never matches NULL (three-valued logic) — the
    // explicit `summaryStatus: null` branch is what lets this claim a
    // meeting generating its summary for the very first time. Two sibling
    // files finishing near-simultaneously can each independently dispatch
    // this command (maybeTrigger is safe to call redundantly) — only one
    // concurrent run can win this claim; the other sees claimed === 0 and
    // no-ops.
    const { count: claimed } = await this.prisma.meeting.updateMany({
      where: {
        id: meetingId,
        summaryGenerationToken: token,
        OR: [{ summaryStatus: null }, { summaryStatus: { not: 'PROCESSING' } }],
      },
      data: { summaryStatus: 'PROCESSING' },
    });

    if (claimed === 0) {
      return;
    }

    const files = await this.prisma.meetingFile.findMany({
      where: { meetingId },
      orderBy: { uploadedAt: 'asc' },
    });

    const completedFiles = files.filter(
      (file) => file.transcriptionStatus === 'COMPLETED',
    );

    if (completedFiles.length === 0) {
      // The trigger (maybeTrigger) only dispatches once at least one sibling
      // file is COMPLETED, but a concurrent file change (e.g. a delete
      // racing this dispatch) between that check and this read can in
      // principle leave none. There was nothing to summarize — that's not a
      // generation failure, so this resets back to "not yet applicable"
      // (null) rather than routing through the generic FAILED path below,
      // which is reserved for an actual failed attempt. Guarded by the same
      // token compare-and-set as the claim above: if a refresh/invalidation
      // has since superseded this run, its own reset already owns the row.
      // Also nulls the token itself, same as clearMeetingSummary — this run
      // is done, so nothing should still compare-and-set against it.
      await this.prisma.meeting.updateMany({
        where: { id: meetingId, summaryGenerationToken: token },
        data: { summaryStatus: null, summaryGenerationToken: null },
      });
      return;
    }

    try {
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
        // The compare-and-set write comes first and doubles as the guard for
        // everything else in this transaction: if a refresh/invalidation
        // superseded this run while generateMeetingSummary() was in flight,
        // the row's token no longer matches this run's, stillCurrent is 0,
        // and the action item/decision tables — which may already belong to
        // a newer run — are left untouched rather than clobbered with this
        // stale result.
        const { count: stillCurrent } = await tx.meeting.updateMany({
          where: { id: meetingId, summaryGenerationToken: token },
          data: {
            summaryStatus: 'COMPLETED',
            summaryText: result.summary,
            summaryIsPartial: isPartial,
            summaryUpdatedAt: new Date(),
          },
        });

        if (stillCurrent === 0) {
          return;
        }

        await tx.actionItem.deleteMany({ where: { meetingId } });
        await tx.decision.deleteMany({ where: { meetingId } });

        // Stamped explicitly from each array's index, not left to
        // createdAt: Postgres evaluates now() once per transaction, so every
        // row from one createMany call would otherwise get an identical
        // createdAt with no reliable tiebreaker — order preserves the LLM's
        // original list order across reads.
        if (result.actionItems.length > 0) {
          await tx.actionItem.createMany({
            data: result.actionItems.map((item, order) => ({
              meetingId,
              description: item.description,
              assignee: item.assignee ?? null,
              order,
            })),
          });
        }

        if (result.decisions.length > 0) {
          await tx.decision.createMany({
            data: result.decisions.map((description, order) => ({
              meetingId,
              description,
              order,
            })),
          });
        }
      });
    } catch (error) {
      console.error(
        `[GenerateMeetingSummaryHandler] meeting ${meetingId}:`,
        error,
      );

      // Existing summary/action items/decisions (if any, from a prior
      // successful run) are deliberately left untouched — same failure
      // behavior TranscribeMeetingFileHandler gives an existing transcript.
      // Guarded by the same token compare-and-set as the claim above: if a
      // refresh/invalidation has since superseded this run, this stale
      // failure must not stamp FAILED over the newer run's own status. Also
      // nulls the token itself, same as clearMeetingSummary — this run is
      // done, so nothing should still compare-and-set against it.
      await this.prisma.meeting.updateMany({
        where: { id: meetingId, summaryGenerationToken: token },
        data: { summaryStatus: 'FAILED', summaryGenerationToken: null },
      });
    }
  }
}
