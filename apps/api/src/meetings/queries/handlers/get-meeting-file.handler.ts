import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  GetMeetingFileQuery,
  MeetingFileRecord,
} from '../get-meeting-file.query';

@QueryHandler(GetMeetingFileQuery)
export class GetMeetingFileHandler implements IQueryHandler<GetMeetingFileQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    meetingId,
  }: GetMeetingFileQuery): Promise<MeetingFileRecord> {
    // Unscoped by organizer, same as GetMeetingHandler since Phase 1 — any
    // authenticated user can read a meeting's file metadata/bytes.
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // All five file columns are always written together (UploadMeetingFileHandler)
    // and cleared together (DeleteMeetingFileHandler), so a non-null filePath
    // guarantees the rest are non-null too — narrow the Prisma-nullable shape
    // down to MeetingFileRecord accordingly.
    if (
      !meeting.filePath ||
      !meeting.fileOriginalName ||
      !meeting.fileMimeType ||
      meeting.fileSize == null ||
      !meeting.fileUploadedAt
    ) {
      throw new NotFoundException('No file exists for this meeting');
    }

    return {
      fileOriginalName: meeting.fileOriginalName,
      filePath: meeting.filePath,
      fileMimeType: meeting.fileMimeType,
      fileSize: meeting.fileSize,
      fileUploadedAt: meeting.fileUploadedAt,
    };
  }
}
