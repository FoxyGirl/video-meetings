import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { UpdateUsernameCommand } from './commands/update-username.command';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { GetUserProfileQuery } from './queries/get-user-profile.query';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.queryBus.execute(new GetUserProfileQuery(request.user.userId));
  }

  @Patch('me/username')
  updateUsername(
    @Req() request: AuthenticatedRequest,
    @Body() { username }: UpdateUsernameDto,
  ) {
    return this.commandBus.execute(
      new UpdateUsernameCommand(request.user.userId, username),
    );
  }
}
