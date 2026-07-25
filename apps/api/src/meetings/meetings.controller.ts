import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateMeetingCommand } from './commands/create-meeting.command';
import { UploadMeetingFileCommand } from './commands/upload-meeting-file.command';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import {
  GetMeetingFileQuery,
  MeetingFileRecord,
} from './queries/get-meeting-file.query';
import { GetMeetingQuery } from './queries/get-meeting.query';
import { GetMeetingsQuery } from './queries/get-meetings.query';
import { meetingFileUploadOptions } from './upload/multer.config';

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMeetingDto, @Req() request: AuthenticatedRequest) {
    return this.commandBus.execute(
      new CreateMeetingCommand(
        request.user.userId,
        dto.title,
        dto.date,
        dto.participants,
      ),
    );
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.queryBus.execute(new GetMeetingsQuery(request.user.userId));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.queryBus.execute(new GetMeetingQuery(id));
  }

  @Post(':id/file')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', meetingFileUploadOptions))
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commandBus.execute(
      new UploadMeetingFileCommand(id, request.user.userId, file),
    );
  }

  @Get(':id/file')
  async getFileMetadata(@Param('id') id: string) {
    const meeting = await this.queryBus.execute<
      GetMeetingFileQuery,
      MeetingFileRecord
    >(new GetMeetingFileQuery(id));

    return {
      fileOriginalName: meeting.fileOriginalName,
      fileMimeType: meeting.fileMimeType,
      fileSize: meeting.fileSize,
      fileUploadedAt: meeting.fileUploadedAt,
    };
  }
}
