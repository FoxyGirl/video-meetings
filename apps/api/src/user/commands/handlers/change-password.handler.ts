import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../../../prisma/generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthResult } from '../../../auth/interfaces/auth-result.interface';
import { UserWithCredentials } from '../../interfaces/user-record.interface';
import { FindUserByIdQuery } from '../../queries/find-user-by-id.query';
import { ChangePasswordCommand } from '../change-password.command';

const SALT_ROUNDS = 10;
const PRISMA_ERROR_RECORD_NOT_FOUND = 'P2025';

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
    private readonly jwtService: JwtService,
  ) {}

  async execute({
    userId,
    currentPassword,
    newPassword,
  }: ChangePasswordCommand): Promise<AuthResult> {
    const user = await this.queryBus.execute<
      FindUserByIdQuery,
      UserWithCredentials | null
    >(new FindUserByIdQuery(userId));
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });
    } catch (error) {
      // A still-valid JWT for a since-deleted user hits this: the row is gone
      // by the time `update` runs, which Prisma reports as P2025 rather than
      // returning null (unlike `findUnique`).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_ERROR_RECORD_NOT_FOUND
      ) {
        throw new UnauthorizedException('Invalid credentials');
      }
      throw error;
    }

    // Outstanding JWTs issued before this change (other tabs/devices, or this
    // same request's own token) stay valid until they naturally expire —
    // nothing re-checks the stored hash on each request. Reissuing a fresh
    // token here at least lets the calling session pick up a token that was
    // minted after the change, matching LoginHandler's AuthResult shape.
    return {
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
    };
  }
}
