import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../../prisma/generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfile } from '../../interfaces/user-record.interface';
import { AVATAR_UPLOAD_DIR } from '../../upload/avatar-upload.constants';
import { validateFileType } from '../../upload/validate-file-type';
import { UploadAvatarCommand } from '../upload-avatar.command';

const PRISMA_ERROR_RECORD_NOT_FOUND = 'P2025';

@CommandHandler(UploadAvatarCommand)
export class UploadAvatarHandler implements ICommandHandler<UploadAvatarCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ userId, file }: UploadAvatarCommand): Promise<UserProfile> {
    if (!file) {
      throw new BadRequestException('No file was provided.');
    }

    try {
      // Authoritative re-check, on top of the interceptor's fileFilter.
      validateFileType(file.originalname, file.mimetype);

      const previous = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { avatarPath: true },
      });

      // Crash-safe replace ordering: the new file is already written to disk
      // (by multer, before this handler ran) and the row is updated to point
      // at it before the old file is deleted. A crash between these leaves
      // at worst an orphaned old file, never a row pointing at a deleted
      // one. No row-locking transaction here (unlike meeting file replace):
      // an avatar upload is only ever reachable via the uploader's own
      // authenticated session, so there's no cross-request race to guard
      // against, just a single user's own possibly-concurrent tabs.
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          avatarPath: file.filename,
          avatarMimeType: file.mimetype,
          avatarUploadedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          username: true,
          avatarMimeType: true,
          avatarUploadedAt: true,
        },
      });

      if (previous?.avatarPath) {
        await unlink(join(AVATAR_UPLOAD_DIR, previous.avatarPath)).catch(
          () => undefined,
        );
      }

      return updated;
    } catch (error) {
      // No file should be left on disk in a rejection case.
      await unlink(file.path).catch(() => undefined);

      // A still-valid JWT for a since-deleted user hits this: the row is
      // gone by the time `update` runs, which Prisma reports as P2025.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_ERROR_RECORD_NOT_FOUND
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }
}
