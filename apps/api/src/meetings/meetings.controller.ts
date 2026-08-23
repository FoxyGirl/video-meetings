import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateMeetingCommand } from './commands/create-meeting.command';
import { DeleteMeetingFileCommand } from './commands/delete-meeting-file.command';
import { RefreshTranscriptionCommand } from './commands/refresh-transcription.command';
import { UploadMeetingFileCommand } from './commands/upload-meeting-file.command';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import {
  GetMeetingFileQuery,
  MeetingFileRecord,
} from './queries/get-meeting-file.query';
import { GetMeetingQuery } from './queries/get-meeting.query';
import { GetMeetingsQuery } from './queries/get-meetings.query';
import { ListMeetingFilesQuery } from './queries/list-meeting-files.query';
import { buildAttachmentContentDisposition } from './upload/content-disposition';
import {
  MAX_FILES_PER_MEETING,
  getUploadDir,
} from './upload/file-upload.constants';
import { meetingFilesUploadOptions } from './upload/multer.config';

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

  @Post(':id/files')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_MEETING, meetingFilesUploadOptions),
  )
  uploadFiles(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commandBus.execute(
      new UploadMeetingFileCommand(id, request.user.userId, files ?? []),
    );
  }

  @Get(':id/files')
  listFiles(@Param('id') id: string) {
    return this.queryBus.execute(new ListMeetingFilesQuery(id));
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
      transcriptionStatus: meeting.transcriptionStatus,
      transcriptionText: meeting.transcriptionText,
    };
  }

  @Get(':id/file/download')
  async downloadFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meeting = await this.queryBus.execute<
      GetMeetingFileQuery,
      MeetingFileRecord
    >(new GetMeetingFileQuery(id));

    res.set({
      'Content-Type': meeting.fileMimeType,
      'Content-Disposition': buildAttachmentContentDisposition(
        meeting.fileOriginalName,
      ),
    });

    return new StreamableFile(
      createReadStream(join(getUploadDir(), meeting.filePath)),
    );
  }

  @Delete(':id/file')
  deleteFile(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.commandBus.execute(
      new DeleteMeetingFileCommand(id, request.user.userId),
    );
  }

  @Post(':id/transcription/refresh')
  @HttpCode(HttpStatus.OK)
  refreshTranscription(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commandBus.execute(
      new RefreshTranscriptionCommand(id, request.user.userId),
    );
  }
}
