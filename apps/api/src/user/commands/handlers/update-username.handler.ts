import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfile } from '../../interfaces/user-record.interface';
import { UpdateUsernameCommand } from '../update-username.command';

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
    // Presence check only — `select` keeps the password hash out of memory,
    // since the update below re-reads the columns actually needed.
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { username: normalizeUsername(username) },
    });

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarMimeType: user.avatarMimeType,
      avatarUploadedAt: user.avatarUploadedAt,
    };
  }
}
