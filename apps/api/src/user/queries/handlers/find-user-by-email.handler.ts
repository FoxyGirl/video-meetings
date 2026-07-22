import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserWithCredentials } from '../../interfaces/user-record.interface';
import { FindUserByEmailQuery } from '../find-user-by-email.query';

@QueryHandler(FindUserByEmailQuery)
export class FindUserByEmailHandler implements IQueryHandler<FindUserByEmailQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    email,
  }: FindUserByEmailQuery): Promise<UserWithCredentials | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return null;
    }

    return { id: user.id, email: user.email, password: user.password };
  }
}
