import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserWithCredentials } from '../../interfaces/user-record.interface';
import { FindUserByIdQuery } from '../find-user-by-id.query';

@QueryHandler(FindUserByIdQuery)
export class FindUserByIdHandler implements IQueryHandler<FindUserByIdQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    id,
  }: FindUserByIdQuery): Promise<UserWithCredentials | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      return null;
    }

    return { id: user.id, email: user.email, password: user.password };
  }
}
