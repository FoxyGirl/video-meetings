import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { UpdateUsernameCommand } from './commands/update-username.command';
import { UploadAvatarCommand } from './commands/upload-avatar.command';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { UserProfile } from './interfaces/user-record.interface';
import {
  GetUserAvatarQuery,
  UserAvatarRecord,
} from './queries/get-user-avatar.query';
import { GetUserProfileQuery } from './queries/get-user-profile.query';
import { AVATAR_UPLOAD_DIR } from './upload/avatar-upload.constants';
import { avatarUploadOptions } from './upload/multer.config';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('me')
  me(@Req() request: AuthenticatedRequest): Promise<UserProfile> {
    return this.queryBus.execute(new GetUserProfileQuery(request.user.userId));
  }

  @Patch('me/username')
  updateUsername(
    @Req() request: AuthenticatedRequest,
    @Body() { username }: UpdateUsernameDto,
  ): Promise<UserProfile> {
    return this.commandBus.execute(
      new UpdateUsernameCommand(request.user.userId, username),
    );
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', avatarUploadOptions))
  uploadAvatar(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UserProfile> {
    return this.commandBus.execute(
      new UploadAvatarCommand(request.user.userId, file),
    );
  }

  @Get('me/avatar')
  async getAvatar(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const avatar = await this.queryBus.execute<
      GetUserAvatarQuery,
      UserAvatarRecord
    >(new GetUserAvatarQuery(request.user.userId));

    res.set({
      'Content-Type': avatar.avatarMimeType,
      'Cache-Control': 'private, max-age=60, must-revalidate',
      'Last-Modified': avatar.avatarUploadedAt.toUTCString(),
    });

    return new StreamableFile(
      createReadStream(join(AVATAR_UPLOAD_DIR, avatar.avatarPath)),
    ).setErrorHandler((err, response) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      response.statusCode = HttpStatus.NOT_FOUND;
      response.send('Avatar file not found');
    });
  }
}
