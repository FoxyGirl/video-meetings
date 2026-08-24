import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { toMeetingFileMetadata } from '../../meeting-file.types';
import { ListMeetingFilesQuery } from '../list-meeting-files.query';

@QueryHandler(ListMeetingFilesQuery)
export class ListMeetingFilesHandler implements IQueryHandler<ListMeetingFilesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId }: ListMeetingFilesQuery) {
    // Unscoped by organizer, same access rule the old single-file metadata
    // endpoint used — any authenticated user can list a meeting's files.
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    const files = await this.prisma.meetingFile.findMany({
      where: { meetingId },
      orderBy: { uploadedAt: 'asc' },
    });

    return files.map(toMeetingFileMetadata);
  }
}
