import { mkdirSync } from 'node:fs';
import { Module, OnModuleInit } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { MeetingsController } from './meetings.controller';
import { CreateMeetingHandler } from './commands/handlers/create-meeting.handler';
import { DeleteMeetingFileHandler } from './commands/handlers/delete-meeting-file.handler';
import { GenerateMeetingSummaryHandler } from './commands/handlers/generate-meeting-summary.handler';
import { RefreshMeetingSummaryHandler } from './commands/handlers/refresh-meeting-summary.handler';
import { RefreshTranscriptionHandler } from './commands/handlers/refresh-transcription.handler';
import { TranscribeMeetingFileHandler } from './commands/handlers/transcribe-meeting-file.handler';
import { UploadMeetingFileHandler } from './commands/handlers/upload-meeting-file.handler';
import { GetMeetingFileHandler } from './queries/handlers/get-meeting-file.handler';
import { GetMeetingsHandler } from './queries/handlers/get-meetings.handler';
import { GetMeetingHandler } from './queries/handlers/get-meeting.handler';
import { ListMeetingFilesHandler } from './queries/handlers/list-meeting-files.handler';
import { MeetingSummaryTriggerService } from './summary/meeting-summary-trigger.service';
import { getUploadDir } from './upload/file-upload.constants';

const CommandHandlers = [
  CreateMeetingHandler,
  UploadMeetingFileHandler,
  DeleteMeetingFileHandler,
  TranscribeMeetingFileHandler,
  RefreshTranscriptionHandler,
  GenerateMeetingSummaryHandler,
  RefreshMeetingSummaryHandler,
];
const QueryHandlers = [
  GetMeetingsHandler,
  GetMeetingHandler,
  GetMeetingFileHandler,
  ListMeetingFilesHandler,
];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    MeetingSummaryTriggerService,
  ],
})
export class MeetingsModule implements OnModuleInit {
  onModuleInit() {
    // multer's diskStorage does not create missing directories itself.
    mkdirSync(getUploadDir(), { recursive: true });
  }
}
