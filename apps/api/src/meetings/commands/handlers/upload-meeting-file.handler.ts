import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { flattenMeetingFile } from '../../meeting-file-flatten.util';
import { isTranscriptionEnabled } from '../../transcription/whisper.constants';
import { getUploadDir } from '../../upload/file-upload.constants';
import { validateFileType } from '../../upload/validate-file-type';
import { TranscribeMeetingFileCommand } from '../transcribe-meeting-file.command';
import { UploadMeetingFileCommand } from '../upload-meeting-file.command';

interface LockedMeetingRow {
  id: string;
}

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<UploadMeetingFileCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute({ meetingId, organizerId, file }: UploadMeetingFileCommand) {
    if (!file) {
      throw new BadRequestException('No file was provided.');
    }

    try {
      // Authoritative re-check, on top of the interceptor's fileFilter.
      validateFileType(file.originalname, file.mimetype);

      const { meeting, createdFile, oldFilePath } =
        await this.prisma.$transaction(async (tx) => {
          // SELECT ... FOR UPDATE locks the row for the rest of this
          // transaction, so a concurrent re-upload to the same meeting
          // blocks here until this one commits, instead of both reading the
          // same "old" file row and racing on which file gets orphaned.
          // Same ownership shape GetMeetingHandler used before Phase 1.
          // Only "id" is selected here — the raw query's only job is proving
          // the row exists, is owned by this organizer, and taking the lock;
          // the full row is fetched below via a type-checked Prisma call
          // instead of trusting a hand-typed raw-SQL shape.
          const [lockedMeeting] = await tx.$queryRaw<LockedMeetingRow[]>`
            SELECT "id" FROM "Meeting"
            WHERE "id" = ${meetingId} AND "organizerId" = ${organizerId}
            FOR UPDATE
          `;

          if (!lockedMeeting) {
            throw new NotFoundException('Meeting not found');
          }

          // One row per meeting, same invariant Meeting's own file columns
          // used to enforce — an upload always deletes whatever row exists
          // (if any) and inserts a fresh one, rather than updating in place,
          // so a transcript job dispatched against the old row's id can
          // never be mistaken for belonging to the new one.
          const existingFile = await tx.meetingFile.findFirst({
            where: { meetingId },
          });

          if (existingFile) {
            await tx.meetingFile.delete({ where: { id: existingFile.id } });
          }

          // Crash-safe replace ordering: the new file is already written to
          // disk (by multer, before this handler ran) and the row is
          // created to point at it before the old file is deleted. A crash
          // between these leaves at worst an orphaned old file, never a row
          // pointing at a deleted one.
          const created = await tx.meetingFile.create({
            data: {
              meetingId,
              originalName: file.originalname,
              filePath: file.filename,
              mimeType: file.mimetype,
              size: file.size,
              uploadedAt: new Date(),
            },
          });

          const meetingRow = await tx.meeting.findUniqueOrThrow({
            where: { id: meetingId },
          });

          return {
            meeting: meetingRow,
            createdFile: created,
            oldFilePath: existingFile?.filePath ?? null,
          };
        });

      if (oldFilePath) {
        await unlink(join(getUploadDir(), oldFilePath)).catch(() => undefined);
      }

      if (!isTranscriptionEnabled()) {
        return flattenMeetingFile(meeting, createdFile);
      }

      // Set PENDING as its own write (after the upload's own transaction has
      // committed) so the response already reflects it, then dispatch the
      // actual transcription job without awaiting it — the HTTP response
      // returns as soon as the upload itself is done, per the plan's
      // "Open technical decision" (in-process, fire-and-forget, not a
      // durable queue).
      const withPendingStatus = await this.prisma.meetingFile.update({
        where: { id: createdFile.id },
        data: { transcriptionStatus: 'PENDING' },
      });

      this.commandBus
        .execute(
          new TranscribeMeetingFileCommand(
            meetingId,
            createdFile.id,
            createdFile.filePath,
          ),
        )
        .catch((error: unknown) => {
          console.error(
            `[UploadMeetingFileHandler] failed to dispatch transcription for meeting ${meetingId}:`,
            error,
          );
        });

      return flattenMeetingFile(meeting, withPendingStatus);
    } catch (error) {
      // No file should be left on disk in a rejection case.
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }
}
