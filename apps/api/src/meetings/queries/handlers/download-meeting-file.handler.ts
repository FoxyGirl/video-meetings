import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DownloadMeetingFileQuery,
  MeetingFileDownloadRecord,
} from '../download-meeting-file.query';

@QueryHandler(DownloadMeetingFileQuery)
export class DownloadMeetingFileHandler implements IQueryHandler<DownloadMeetingFileQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    meetingId,
    fileId,
  }: DownloadMeetingFileQuery): Promise<MeetingFileDownloadRecord> {
    // Unscoped by organizer, same as before — any authenticated user can
    // download a meeting's file.
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    const file = await this.prisma.meetingFile.findUnique({
      where: { id: fileId },
    });

    // Scoped by both fileId and meetingId — a fileId that exists but
    // belongs to a different meeting is treated the same as one that
    // doesn't exist at all, rather than leaking cross-meeting existence.
    if (!file || file.meetingId !== meetingId) {
      throw new NotFoundException('File not found');
    }

    return {
      originalName: file.originalName,
      filePath: file.filePath,
      mimeType: file.mimeType,
    };
  }
}
