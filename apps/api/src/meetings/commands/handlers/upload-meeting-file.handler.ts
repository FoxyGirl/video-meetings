import { unlink } from 'node:fs/promises';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { MeetingFile } from '../../../../prisma/generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  MeetingFileMetadata,
  toMeetingFileMetadata,
} from '../../meeting-file.types';
import { isTranscriptionEnabled } from '../../transcription/whisper.constants';
import { MAX_FILES_PER_MEETING } from '../../upload/file-upload.constants';
import { validateFileType } from '../../upload/validate-file-type';
import { TranscribeMeetingFileCommand } from '../transcribe-meeting-file.command';
import { UploadMeetingFileCommand } from '../upload-meeting-file.command';

interface LockedMeetingRow {
  id: string;
}

interface RejectedFile {
  originalName: string;
  reason: string;
}

interface UploadBatchResult {
  accepted: MeetingFileMetadata[];
  rejected: RejectedFile[];
}

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<UploadMeetingFileCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute({
    meetingId,
    organizerId,
    files,
  }: UploadMeetingFileCommand): Promise<UploadBatchResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files were provided.');
    }

    try {
      // Per-file type validation up front — a pure check against the
      // multer-provided originalname/mimetype, no DB state needed. Unlike
      // the old single-file route, meetingFilesUploadOptions has no
      // fileFilter of its own (see its own comment), so this is the first
      // point any file in the batch is actually validated; a rejection here
      // never aborts the rest of the batch.
      const rejected: RejectedFile[] = [];
      const typeValid: Express.Multer.File[] = [];

      for (const file of files) {
        try {
          validateFileType(file.originalname, file.mimetype);
          typeValid.push(file);
        } catch (error) {
          rejected.push({
            originalName: file.originalname,
            reason: error instanceof Error ? error.message : 'Invalid file.',
          });
        }
      }

      const { createdFiles, capRejected } = await this.prisma.$transaction(
        async (tx) => {
          // SELECT ... FOR UPDATE locks the row for the rest of this
          // transaction, so a concurrent batch upload to the same meeting
          // serializes here instead of both reading the same "existing
          // count" and together overshooting the cap.
          const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
            SELECT "id" FROM "Meeting"
            WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
            FOR UPDATE
          `;

          if (!lockedMeeting) {
            throw new NotFoundException('Meeting not found');
          }

          const existingCount = await tx.meetingFile.count({
            where: { meetingId },
          });
          const available = Math.max(MAX_FILES_PER_MEETING - existingCount, 0);

          const withinCap = typeValid.slice(0, available);
          const overCap = typeValid.slice(available);

          // Uploads are purely additive now — every type-valid, within-cap
          // file becomes its own new row, and no existing row is ever
          // touched, unlike the old single-file "delete then create" replace
          // semantics.
          const created: MeetingFile[] = [];
          for (const file of withinCap) {
            created.push(
              await tx.meetingFile.create({
                data: {
                  meetingId,
                  originalName: file.originalname,
                  filePath: file.filename,
                  mimeType: file.mimetype,
                  size: file.size,
                  uploadedAt: new Date(),
                },
              }),
            );
          }

          return { createdFiles: created, capRejected: overCap };
        },
      );

      for (const file of capRejected) {
        rejected.push({
          originalName: file.originalname,
          reason: `Meeting already has the maximum of ${MAX_FILES_PER_MEETING} files.`,
        });
      }

      // Every rejected file (bad type or cap-exceeded) was still written to
      // disk by multer, since fileFilter can't reject any of them upfront
      // without aborting the whole batch — clean each one up individually
      // now that the accept/reject split is known. filePath (the
      // server-generated on-disk name) is unique per file, so this can't
      // accidentally sweep up an accepted file sharing a rejected one's
      // original name.
      const acceptedPaths = new Set(createdFiles.map((file) => file.filePath));
      await Promise.all(
        files
          .filter((file) => !acceptedPaths.has(file.filename))
          .map((file) => unlink(file.path).catch(() => undefined)),
      );

      if (!isTranscriptionEnabled() || createdFiles.length === 0) {
        return { accepted: createdFiles.map(toMeetingFileMetadata), rejected };
      }

      // Set PENDING as its own write (after the upload's own transaction has
      // committed) so the response already reflects it, then dispatch each
      // accepted file's transcription job independently, without awaiting
      // it — a batch of N accepted files fires N separate fire-and-forget
      // commands, each carrying its own fileId/filePath, so one file's job
      // can never read or write another's row (see
      // TranscribeMeetingFileHandler's id+filePath compare-and-set).
      const withPendingStatus = await Promise.all(
        createdFiles.map((file) =>
          this.prisma.meetingFile.update({
            where: { id: file.id },
            data: { transcriptionStatus: 'PENDING' },
          }),
        ),
      );

      for (const file of withPendingStatus) {
        this.commandBus
          .execute(
            new TranscribeMeetingFileCommand(meetingId, file.id, file.filePath),
          )
          .catch((error: unknown) => {
            console.error(
              `[UploadMeetingFileHandler] failed to dispatch transcription for meeting ${meetingId}, file ${file.id}:`,
              error,
            );
          });
      }

      return {
        accepted: withPendingStatus.map(toMeetingFileMetadata),
        rejected,
      };
    } catch (error) {
      // No file should be left on disk if the batch fails outright (e.g.
      // the meeting doesn't exist or isn't owned by this organizer).
      await Promise.all(
        files.map((file) => unlink(file.path).catch(() => undefined)),
      );
      throw error;
    }
  }
}
