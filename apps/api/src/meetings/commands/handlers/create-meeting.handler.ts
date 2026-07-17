import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMeetingCommand } from '../create-meeting.command';

@CommandHandler(CreateMeetingCommand)
export class CreateMeetingHandler implements ICommandHandler<CreateMeetingCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ organizerId, title, date, participants }: CreateMeetingCommand) {
    return this.prisma.meeting.create({
      data: {
        title,
        date: new Date(date),
        participants,
        organizerId,
      },
    });
  }
}
