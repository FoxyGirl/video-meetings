import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetMeetingsQuery } from '../get-meetings.query';

@QueryHandler(GetMeetingsQuery)
export class GetMeetingsHandler implements IQueryHandler<GetMeetingsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ organizerId }: GetMeetingsQuery) {
    return this.prisma.meeting.findMany({ where: { organizerId } });
  }
}
