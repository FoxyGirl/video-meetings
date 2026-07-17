import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { MeetingsController } from './meetings.controller';
import { CreateMeetingHandler } from './commands/handlers/create-meeting.handler';
import { GetMeetingsHandler } from './queries/handlers/get-meetings.handler';
import { GetMeetingHandler } from './queries/handlers/get-meeting.handler';

const CommandHandlers = [CreateMeetingHandler];
const QueryHandlers = [GetMeetingsHandler, GetMeetingHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingsController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class MeetingsModule {}
