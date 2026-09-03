import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetMeetingQuery } from '../../queries/get-meeting.query';
import { clearMeetingSummary } from '../../summary/clear-meeting-summary';
import { StopMeetingSummaryCommand } from '../stop-meeting-summary.command';

type SummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface LockedMeetingRow {
  id: string;
  summaryStatus: SummaryStatus | null;
}

@CommandHandler(StopMeetingSummaryCommand)
export class StopMeetingSummaryHandler implements ICommandHandler<StopMeetingSummaryCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ meetingId, organizerId }: StopMeetingSummaryCommand) {
    // Same lock + ownership shape upload/delete/refresh-transcription/
    // refresh-summary use: a non-organizer (or nonexistent meeting) gets
    // 404, not 403.
    await this.prisma.$transaction(async (tx) => {
      const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
        SELECT "id", "summaryStatus" FROM "Meeting"
        WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
        FOR UPDATE
      `;

      if (!lockedMeeting) {
        throw new NotFoundException('Meeting not found');
      }

      // Only an in-flight run is actually "stoppable" — clearing a
      // COMPLETED/FAILED (or already-null) summary here would discard a
      // finished result for no reason, e.g. a duplicate Stop click racing
      // the run's own completion.
      if (
        lockedMeeting.summaryStatus === 'PENDING' ||
        lockedMeeting.summaryStatus === 'PROCESSING'
      ) {
        // Nulling summaryGenerationToken (inside clearMeetingSummary) is
        // what actually "stops" generation: GenerateMeetingSummaryHandler's
        // own writes are all keyed on a token match, so whatever result the
        // in-flight generateMeetingSummary() call eventually returns can no
        // longer be written back — the same compare-and-set protection a
        // superseding refresh already relies on. The outbound LLM call
        // itself isn't aborted, only its result is discarded.
        await clearMeetingSummary(tx, meetingId);
      }
    });

    // Deliberately doesn't call MeetingSummaryTriggerService.maybeTrigger()
    // afterward, unlike RefreshMeetingSummaryHandler — stopping should leave
    // the meeting at "not yet available" until the organizer explicitly
    // asks for a summary again, not immediately restart the very run they
    // just asked to stop.
    return this.queryBus.execute<GetMeetingQuery, unknown>(
      new GetMeetingQuery(meetingId),
    );
  }
}
