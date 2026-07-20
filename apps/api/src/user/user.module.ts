import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateUserHandler } from './commands/handlers/create-user.handler';
import { FindUserByEmailHandler } from './queries/handlers/find-user-by-email.handler';
import { UserCreatedHandler } from './events/handlers/user-created.handler';

const CommandHandlers = [CreateUserHandler];
const QueryHandlers = [FindUserByEmailHandler];
const EventHandlers = [UserCreatedHandler];

@Module({
  imports: [CqrsModule],
  providers: [...CommandHandlers, ...QueryHandlers, ...EventHandlers],
})
export class UserModule {}
