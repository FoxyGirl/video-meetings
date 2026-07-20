import { ConflictException } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserRecord } from '../../interfaces/user-record.interface';
import { UserCreatedEvent } from '../../events/user-created.event';
import { CreateUserCommand } from '../create-user.command';

const SALT_ROUNDS = 10;

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ email, password }: CreateUserCommand): Promise<UserRecord> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, password: hashedPassword },
    });

    this.eventBus.publish(new UserCreatedEvent(user.id, user.email));

    return { id: user.id, email: user.email };
  }
}
