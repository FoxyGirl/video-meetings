import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { DeleteMeetingCommand } from '../delete-meeting.command';

interface LockedMeetingRow {
  id: string;
}

@CommandHandler(DeleteMeetingCommand)
export class DeleteMeetingHandler implements ICommandHandler<DeleteMeetingCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, organizerId }: DeleteMeetingCommand) {
    await this.prisma.$transaction(async (tx) => {
      // Same lock + ownership shape upload/delete-file/refresh-transcription
      // use: a non-organizer (or nonexistent meeting) gets 404, not 403.
      const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
        SELECT "id" FROM "Meeting"
        WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
        FOR UPDATE
      `;

      if (!lockedMeeting) {
        throw new NotFoundException('Meeting not found');
      }

      // Cascade (onDelete: Cascade) removes the dependent MeetingFile/
      // ActionItem/Decision rows automatically.
      await tx.meeting.delete({ where: { id: meetingId } });
    });
  }
}
