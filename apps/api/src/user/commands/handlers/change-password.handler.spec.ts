import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { QueryBus } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../../../../prisma/generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChangePasswordCommand } from '../change-password.command';
import { ChangePasswordHandler } from './change-password.handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('ChangePasswordHandler', () => {
  let queryBusExecute: jest.Mock;
  let update: jest.Mock;
  let sign: jest.Mock;
  let handler: ChangePasswordHandler;
  let currentHash: string;

  beforeEach(async () => {
    currentHash = await bcrypt.hash('CurrentPass1!', 10);
    queryBusExecute = jest.fn(() =>
      Promise.resolve({
        id: USER_ID,
        email: 'ada@example.com',
        password: currentHash,
      }),
    );
    update = jest.fn(() => Promise.resolve());
    sign = jest.fn(() => 'new-jwt-token');

    handler = new ChangePasswordHandler(
      { user: { update } } as unknown as PrismaService,
      { execute: queryBusExecute } as unknown as QueryBus,
      { sign } as unknown as JwtService,
    );
  });

  it('hashes and persists the new password when the current password matches', async () => {
    await handler.execute(
      new ChangePasswordCommand(USER_ID, 'CurrentPass1!', 'NewPassword1!'),
    );

    expect(update).toHaveBeenCalledTimes(1);
    const call = update.mock.calls[0] as [
      { where: { id: string }; data: { password: string } },
    ];
    expect(call[0].where).toEqual({ id: USER_ID });
    expect(call[0].data.password).not.toBe('NewPassword1!');
    await expect(
      bcrypt.compare('NewPassword1!', call[0].data.password),
    ).resolves.toBe(true);
  });

  it('returns a freshly signed JWT for the calling session', async () => {
    const result = await handler.execute(
      new ChangePasswordCommand(USER_ID, 'CurrentPass1!', 'NewPassword1!'),
    );

    expect(sign).toHaveBeenCalledWith({
      sub: USER_ID,
      email: 'ada@example.com',
    });
    expect(result).toEqual({ accessToken: 'new-jwt-token' });
  });

  it('throws 400 and does not persist when the new password matches the current one', async () => {
    await expect(
      handler.execute(
        new ChangePasswordCommand(USER_ID, 'CurrentPass1!', 'CurrentPass1!'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(update).not.toHaveBeenCalled();
  });

  it('throws 403 and does not persist when the current password does not match', async () => {
    await expect(
      handler.execute(
        new ChangePasswordCommand(USER_ID, 'WrongPassword!', 'NewPassword1!'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(update).not.toHaveBeenCalled();
  });

  it('throws 401 and does not persist when the user no longer exists', async () => {
    queryBusExecute.mockImplementation(() => Promise.resolve(null));

    await expect(
      handler.execute(
        new ChangePasswordCommand(USER_ID, 'CurrentPass1!', 'NewPassword1!'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(update).not.toHaveBeenCalled();
  });

  it('throws 401 when the user is deleted between the lookup and the update', async () => {
    update.mockImplementation(() =>
      Promise.reject(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      ),
    );

    await expect(
      handler.execute(
        new ChangePasswordCommand(USER_ID, 'CurrentPass1!', 'NewPassword1!'),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rethrows other Prisma errors unchanged', async () => {
    const unrelatedError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    update.mockImplementation(() => Promise.reject(unrelatedError));

    await expect(
      handler.execute(
        new ChangePasswordCommand(USER_ID, 'CurrentPass1!', 'NewPassword1!'),
      ),
    ).rejects.toBe(unrelatedError);
  });
});
