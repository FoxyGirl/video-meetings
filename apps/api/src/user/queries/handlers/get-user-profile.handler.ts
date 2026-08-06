import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfile } from '../../interfaces/user-record.interface';
import { GetUserProfileQuery } from '../get-user-profile.query';

@QueryHandler(GetUserProfileQuery)
export class GetUserProfileHandler implements IQueryHandler<GetUserProfileQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ userId }: GetUserProfileQuery): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        avatarMimeType: true,
        avatarUploadedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
