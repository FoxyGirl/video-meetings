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

    // Per-file type validation up front — a pure check against the
    // multer-provided originalname/mimetype, no DB state needed. Unlike the
    // old single-file route, meetingFilesUploadOptions has no fileFilter of
    // its own (see its own comment), so this is the first point any file in
    // the batch is actually validated; a rejection here never aborts the
    // rest of the batch.
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

    let createdFiles: MeetingFile[];
    let capRejected: Express.Multer.File[];
    try {
      ({ createdFiles, capRejected } = await this.prisma.$transaction(
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
      ));
    } catch (error) {
      // Nothing was committed here — the transaction above never resolved,
      // so every file in this batch (accepted or rejected) is still just
      // bytes on disk with no MeetingFile row pointing at it. Safe to
      // remove all of them, unlike a failure after this point (see below).
      await Promise.all(
        files.map((file) => unlink(file.path).catch(() => undefined)),
      );
      throw error;
    }

    for (const file of capRejected) {
      rejected.push({
        originalName: file.originalname,
        reason: `Meeting already has the maximum of ${MAX_FILES_PER_MEETING} files.`,
      });
    }

    // Every rejected file (bad type or cap-exceeded) was still written to
    // disk by multer, since fileFilter can't reject any of them upfront
    // without aborting the whole batch — clean each one up individually now
    // that the accept/reject split is known. filePath (the server-generated
    // on-disk name) is unique per file, so this can't accidentally sweep up
    // an accepted file sharing a rejected one's original name.
    const acceptedPaths = new Set(createdFiles.map((file) => file.filePath));
    await Promise.all(
      files
        .filter((file) => !acceptedPaths.has(file.filename))
        .map((file) => unlink(file.path).catch(() => undefined)),
    );

    if (!isTranscriptionEnabled() || createdFiles.length === 0) {
      return { accepted: createdFiles.map(toMeetingFileMetadata), rejected };
    }

    // From here on, every createdFiles row is already committed to the DB
    // and its bytes are meant to stay on disk — a failure setting PENDING
    // or dispatching the transcription job must never unlink an accepted
    // file, or it would orphan a committed row pointing at a deleted file
    // (see the resolved catch above, which only ever runs before anything
    // is committed). Each file's PENDING write is caught individually so
    // one file's transient DB error can't take down the rest of the
    // batch's response or, worse, read as license to delete anything.
    const withPendingStatus = await Promise.all(
      createdFiles.map((file) =>
        this.prisma.meetingFile
          .update({
            where: { id: file.id },
            data: { transcriptionStatus: 'PENDING' },
          })
          .catch((error: unknown) => {
            console.error(
              `[UploadMeetingFileHandler] failed to set PENDING for meeting ${meetingId}, file ${file.id}:`,
              error,
            );
            return file;
          }),
      ),
    );

    // Dispatched off the original createdFiles' id/filePath, not the
    // (possibly PENDING-write-failed) withPendingStatus result — the
    // transcription job's own compare-and-set (TranscribeMeetingFileHandler)
    // matches on id + filePath only, not on the row currently being
    // PENDING, so a failed PENDING write here doesn't need to block the job
    // itself from running.
    for (const file of createdFiles) {
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
  }
}
