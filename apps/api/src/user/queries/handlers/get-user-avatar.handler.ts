import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetUserAvatarQuery, UserAvatarRecord } from '../get-user-avatar.query';

@QueryHandler(GetUserAvatarQuery)
export class GetUserAvatarHandler implements IQueryHandler<GetUserAvatarQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ userId }: GetUserAvatarQuery): Promise<UserAvatarRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarPath: true, avatarMimeType: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Both columns are always written together (UploadAvatarHandler), so a
    // non-null avatarPath guarantees avatarMimeType is non-null too.
    if (!user.avatarPath || !user.avatarMimeType) {
      throw new NotFoundException('No avatar exists for this user');
    }

    return { avatarPath: user.avatarPath, avatarMimeType: user.avatarMimeType };
  }
}
