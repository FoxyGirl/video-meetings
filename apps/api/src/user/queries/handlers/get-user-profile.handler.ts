import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfile } from '../../interfaces/user-record.interface';
import { GetUserProfileQuery } from '../get-user-profile.query';

@QueryHandler(GetUserProfileQuery)
export class GetUserProfileHandler implements IQueryHandler<GetUserProfileQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ userId }: GetUserProfileQuery): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarMimeType: user.avatarMimeType,
      avatarUploadedAt: user.avatarUploadedAt,
    };
  }
}
