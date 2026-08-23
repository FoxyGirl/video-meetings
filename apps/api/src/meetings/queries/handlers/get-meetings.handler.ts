import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { flattenMeetingFile } from '../../meeting-file-flatten.util';
import { GetMeetingsQuery } from '../get-meetings.query';

@QueryHandler(GetMeetingsQuery)
export class GetMeetingsHandler implements IQueryHandler<GetMeetingsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ organizerId }: GetMeetingsQuery) {
    const meetings = await this.prisma.meeting.findMany({
      where: { organizerId },
      include: { files: true },
    });

    // Same byte-for-byte-unchanged re-flattening GetMeetingHandler does.
    return meetings.map(({ files, ...meetingFields }) =>
      flattenMeetingFile(meetingFields, files[0] ?? null),
    );
  }
}
