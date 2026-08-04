import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { GetUserProfileQuery } from './queries/get-user-profile.query';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.queryBus.execute(new GetUserProfileQuery(request.user.userId));
  }
}
