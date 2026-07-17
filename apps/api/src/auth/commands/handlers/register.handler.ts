import { ConflictException } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthResult } from '../../interfaces/auth-result.interface';
import { UserRegisteredEvent } from '../../events/user-registered.event';
import { RegisterCommand } from '../register.command';

const SALT_ROUNDS = 10;

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ email, password }: RegisterCommand): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, password: hashedPassword },
    });

    this.eventBus.publish(new UserRegisteredEvent(user.id, user.email));

    return {
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
    };
  }
}
