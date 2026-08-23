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

    // One row per meeting, this phase — the file's own columns are
    // required (NOT NULL) on MeetingFile itself now, so no manual
    // non-null narrowing is needed once a row is found.
    const file = await this.prisma.meetingFile.findFirst({
      where: { meetingId },
    });

    if (!file) {
      throw new NotFoundException('No file exists for this meeting');
    }

    return {
      fileOriginalName: file.originalName,
      filePath: file.filePath,
      fileMimeType: file.mimeType,
      fileSize: file.size,
      fileUploadedAt: file.uploadedAt,
      transcriptionStatus: file.transcriptionStatus,
      transcriptionText: file.transcriptionText,
    };
  }
}
