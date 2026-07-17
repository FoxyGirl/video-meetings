import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { RegisterHandler } from './commands/handlers/register.handler';
import { LoginHandler } from './queries/handlers/login.handler';
import { UserRegisteredHandler } from './events/handlers/user-registered.handler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const CommandHandlers = [RegisterHandler];
const QueryHandlers = [LoginHandler];
const EventHandlers = [UserRegisteredHandler];

@Module({
  imports: [
    CqrsModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    JwtAuthGuard,
  ],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
