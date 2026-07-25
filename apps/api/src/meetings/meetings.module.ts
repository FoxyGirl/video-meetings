import { mkdirSync } from 'node:fs';
import { Module, OnModuleInit } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { MeetingsController } from './meetings.controller';
import { CreateMeetingHandler } from './commands/handlers/create-meeting.handler';
import { UploadMeetingFileHandler } from './commands/handlers/upload-meeting-file.handler';
import { GetMeetingsHandler } from './queries/handlers/get-meetings.handler';
import { GetMeetingHandler } from './queries/handlers/get-meeting.handler';
import { getUploadDir } from './upload/file-upload.constants';

const CommandHandlers = [CreateMeetingHandler, UploadMeetingFileHandler];
const QueryHandlers = [GetMeetingsHandler, GetMeetingHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingsController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class MeetingsModule implements OnModuleInit {
  onModuleInit() {
    // multer's diskStorage does not create missing directories itself.
    mkdirSync(getUploadDir(), { recursive: true });
  }
}
