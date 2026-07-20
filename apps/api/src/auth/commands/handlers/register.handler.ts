import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { CreateUserCommand } from '../../../user/commands/create-user.command';
import { UserRecord } from '../../../user/interfaces/user-record.interface';
import { AuthResult } from '../../interfaces/auth-result.interface';
import { RegisterCommand } from '../register.command';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly jwtService: JwtService,
  ) {}

  async execute({ email, password }: RegisterCommand): Promise<AuthResult> {
    const user = await this.commandBus.execute<CreateUserCommand, UserRecord>(
      new CreateUserCommand(email, password),
    );

    return {
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
    };
  }
}
