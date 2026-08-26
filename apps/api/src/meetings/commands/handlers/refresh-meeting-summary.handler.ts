import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetMeetingQuery } from '../../queries/get-meeting.query';
import { clearMeetingSummary } from '../../summary/clear-meeting-summary';
import { MeetingSummaryTriggerService } from '../../summary/meeting-summary-trigger.service';
import { RefreshMeetingSummaryCommand } from '../refresh-meeting-summary.command';

interface LockedMeetingRow {
  id: string;
}

@CommandHandler(RefreshMeetingSummaryCommand)
export class RefreshMeetingSummaryHandler implements ICommandHandler<RefreshMeetingSummaryCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
    private readonly meetingSummaryTrigger: MeetingSummaryTriggerService,
  ) {}

  async execute({ meetingId, organizerId }: RefreshMeetingSummaryCommand) {
    // Same lock + ownership shape upload/delete/refresh-transcription use: a
    // non-organizer (or nonexistent meeting) gets 404, not 403.
    await this.prisma.$transaction(async (tx) => {
      const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
        SELECT "id" FROM "Meeting"
        WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
        FOR UPDATE
      `;

      if (!lockedMeeting) {
        throw new NotFoundException('Meeting not found');
      }

      // Refresh always discards the current summary/action items/decisions,
      // regardless of whether one exists yet — unlike the file-change
      // invalidation hooks, there's no "meeting already has a non-empty
      // summary" gate here: an explicit Refresh click should always attempt
      // a new run.
      await clearMeetingSummary(tx, meetingId);
    });

    // Re-runs the same "all files terminal, at least one completed" check
    // Phase 1's automatic trigger uses — a refresh doesn't force generation
    // to run against an unresolved file set, it just clears the stale
    // result and lets the normal trigger condition decide.
    await this.meetingSummaryTrigger.maybeTrigger(meetingId);

    // Re-read rather than trust a locally-constructed response — the
    // trigger above may or may not have fired a new run depending on the
    // meeting's current file states.
    return this.queryBus.execute<GetMeetingQuery, unknown>(
      new GetMeetingQuery(meetingId),
    );
  }
}
