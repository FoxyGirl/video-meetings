import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfile } from '../../interfaces/user-record.interface';
import { AVATAR_UPLOAD_DIR } from '../../upload/avatar-upload.constants';
import { validateFileType } from '../../upload/validate-file-type';
import { UploadAvatarCommand } from '../upload-avatar.command';

interface LockedUserRow {
  id: string;
  avatarPath: string | null;
}

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

      const { updated, oldAvatarPath } = await this.prisma.$transaction(
        async (tx) => {
          // SELECT ... FOR UPDATE locks the row for the rest of this
          // transaction, so a concurrent re-upload from the same user (two
          // tabs, two devices) blocks here until this one commits, instead
          // of both reading the same "old" avatarPath and racing on which
          // file gets orphaned — same pattern UploadMeetingFileHandler uses
          // for concurrent re-uploads to the same meeting.
          const [user] = await tx.$queryRaw<LockedUserRow[]>`
            SELECT "id", "avatarPath" FROM "User"
            WHERE "id" = ${userId}
            FOR UPDATE
          `;

          if (!user) {
            throw new NotFoundException('User not found');
          }

          // Crash-safe replace ordering: the new file is already written to
          // disk (by multer, before this handler ran) and the row is
          // updated to point at it before the old file is deleted. A crash
          // between these leaves at worst an orphaned old file, never a row
          // pointing at a deleted one.
          const result = await tx.user.update({
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

          return { updated: result, oldAvatarPath: user.avatarPath };
        },
      );

      if (oldAvatarPath) {
        await unlink(join(AVATAR_UPLOAD_DIR, oldAvatarPath)).catch(
          () => undefined,
        );
      }

      return updated;
    } catch (error) {
      // No file should be left on disk in a rejection case.
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }
}
