import { Prisma } from '../../../prisma/generated/prisma/client';

// Discards a meeting's existing summary/action items/decisions — shared by
// RefreshMeetingSummaryHandler (always) and the upload/delete/refresh
// invalidation hooks (only when the meeting already has a non-empty
// summary). Takes a Prisma.TransactionClient so every caller can run this
// inside whatever lock it's already holding on the Meeting row, rather than
// taking a second one. Also nulls summaryGenerationToken so a still-running
// generation holding the old token safely no-ops instead of overwriting
// this reset with stale results — see GenerateMeetingSummaryHandler's own
// compare-and-set.
export async function clearMeetingSummary(
  prisma: Prisma.TransactionClient,
  meetingId: string,
): Promise<void> {
  await prisma.actionItem.deleteMany({ where: { meetingId } });
  await prisma.decision.deleteMany({ where: { meetingId } });
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      summaryStatus: null,
      summaryText: null,
      summaryIsPartial: null,
      summaryUpdatedAt: null,
      summaryGenerationToken: null,
    },
  });
}
