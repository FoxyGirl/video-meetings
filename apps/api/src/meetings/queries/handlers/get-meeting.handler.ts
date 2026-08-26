import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { flattenMeetingFile } from '../../meeting-file-flatten.util';
import {
  toActionItemMetadata,
  toDecisionMetadata,
} from '../../summary/action-item-decision.types';
import { GetMeetingQuery } from '../get-meeting.query';

@QueryHandler(GetMeetingQuery)
export class GetMeetingHandler implements IQueryHandler<GetMeetingQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ id }: GetMeetingQuery) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        files: true,
        // order (not createdAt) preserves the LLM's original list order —
        // every row from one generation run's createMany call shares an
        // identical createdAt, since Postgres evaluates now() once per
        // transaction.
        actionItems: { orderBy: { order: 'asc' } },
        decisions: { orderBy: { order: 'asc' } },
      },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // File/transcription state moved onto its own MeetingFile row (Phase
    // 1-multi-file-upload-drag-drop-fix), but this route's response shape
    // must stay byte-for-byte unchanged — re-flatten the (at most one, this
    // phase) file row back onto the old field names. summaryStatus/
    // summaryText/summaryIsPartial/summaryUpdatedAt are plain Meeting
    // columns already, so they pass through meetingFields untouched.
    const { files, actionItems, decisions, ...meetingFields } = meeting;

    return {
      ...flattenMeetingFile(meetingFields, files[0] ?? null),
      actionItems: actionItems.map(toActionItemMetadata),
      decisions: decisions.map(toDecisionMetadata),
    };
  }
}
