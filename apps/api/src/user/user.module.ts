import { mkdirSync } from 'node:fs';
import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { ChangePasswordHandler } from './commands/handlers/change-password.handler';
import { CreateUserHandler } from './commands/handlers/create-user.handler';
import { UpdateUsernameHandler } from './commands/handlers/update-username.handler';
import { UploadAvatarHandler } from './commands/handlers/upload-avatar.handler';
import { FindUserByEmailHandler } from './queries/handlers/find-user-by-email.handler';
import { FindUserByIdHandler } from './queries/handlers/find-user-by-id.handler';
import { GetUserAvatarHandler } from './queries/handlers/get-user-avatar.handler';
import { GetUserProfileHandler } from './queries/handlers/get-user-profile.handler';
import { UserCreatedHandler } from './events/handlers/user-created.handler';
import { UserController } from './user.controller';
import { AVATAR_UPLOAD_DIR } from './upload/avatar-upload.constants';

const CommandHandlers = [
  ChangePasswordHandler,
  CreateUserHandler,
  UpdateUsernameHandler,
  UploadAvatarHandler,
];
const QueryHandlers = [
  FindUserByEmailHandler,
  FindUserByIdHandler,
  GetUserAvatarHandler,
  GetUserProfileHandler,
];
const EventHandlers = [UserCreatedHandler];

@Module({
  imports: [CqrsModule, forwardRef(() => AuthModule)],
  controllers: [UserController],
  providers: [...CommandHandlers, ...QueryHandlers, ...EventHandlers],
})
export class UserModule implements OnModuleInit {
  onModuleInit() {
    // multer's diskStorage does not create missing directories itself.
    mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
  }
}
