import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../../prisma/generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfile } from '../../interfaces/user-record.interface';
import { UpdateUsernameCommand } from '../update-username.command';

const PRISMA_ERROR_RECORD_NOT_FOUND = 'P2025';

/**
 * `undefined` (username omitted from the request body) leaves the stored value
 * untouched — Prisma skips `undefined` fields — while an empty/whitespace-only
 * string or an explicit `null` clears it.
 */
function normalizeUsername(
  username: string | null | undefined,
): string | null | undefined {
  if (username === undefined) {
    return undefined;
  }

  return username?.trim() || null;
}

@CommandHandler(UpdateUsernameCommand)
export class UpdateUsernameHandler implements ICommandHandler<UpdateUsernameCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    userId,
    username,
  }: UpdateUsernameCommand): Promise<UserProfile> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { username: normalizeUsername(username) },
        select: {
          id: true,
          email: true,
          username: true,
          avatarMimeType: true,
          avatarUploadedAt: true,
        },
      });

      return user;
    } catch (error) {
      // A still-valid JWT for a since-deleted user hits this: the row is gone
      // by the time `update` runs, which Prisma reports as P2025 rather than
      // returning null (unlike `findUnique`).
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
