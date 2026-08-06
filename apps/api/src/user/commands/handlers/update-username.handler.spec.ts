import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../prisma/generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateUsernameCommand } from '../update-username.command';
import { UpdateUsernameHandler } from './update-username.handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const PROFILE_SELECT = {
  id: true,
  email: true,
  username: true,
  avatarMimeType: true,
  avatarUploadedAt: true,
};

function buildProfile(username: string | null) {
  return {
    id: USER_ID,
    email: 'ada@example.com',
    username,
    avatarMimeType: null,
    avatarUploadedAt: null,
  };
}

describe('UpdateUsernameHandler', () => {
  let update: jest.Mock;
  let handler: UpdateUsernameHandler;

  beforeEach(() => {
    update = jest.fn(() => Promise.resolve(buildProfile('Ada Lovelace')));

    handler = new UpdateUsernameHandler({
      user: { update },
    } as unknown as PrismaService);
  });

  it('persists the new username scoped to the given user', async () => {
    await handler.execute(new UpdateUsernameCommand(USER_ID, 'Ada Lovelace'));

    expect(update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { username: 'Ada Lovelace' },
      select: PROFILE_SELECT,
    });
  });

  it('returns the updated profile without password or avatar path', async () => {
    const profile = await handler.execute(
      new UpdateUsernameCommand(USER_ID, 'Ada Lovelace'),
    );

    expect(profile).toEqual({
      id: USER_ID,
      email: 'ada@example.com',
      username: 'Ada Lovelace',
      avatarMimeType: null,
      avatarUploadedAt: null,
    });
  });

  it('trims surrounding whitespace from the username', async () => {
    await handler.execute(new UpdateUsernameCommand(USER_ID, '  Ada  '));

    expect(update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { username: 'Ada' },
      select: PROFILE_SELECT,
    });
  });

  it('clears the username when given an empty string', async () => {
    await handler.execute(new UpdateUsernameCommand(USER_ID, ''));

    expect(update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { username: null },
      select: PROFILE_SELECT,
    });
  });

  it('clears the username when given whitespace only', async () => {
    await handler.execute(new UpdateUsernameCommand(USER_ID, '   '));

    expect(update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { username: null },
      select: PROFILE_SELECT,
    });
  });

  it('clears the username when given null', async () => {
    await handler.execute(new UpdateUsernameCommand(USER_ID, null));

    expect(update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { username: null },
      select: PROFILE_SELECT,
    });
  });

  it('leaves the username untouched when it is omitted', async () => {
    await handler.execute(new UpdateUsernameCommand(USER_ID, undefined));

    expect(update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { username: undefined },
      select: PROFILE_SELECT,
    });
  });

  it('throws 404 when the user no longer exists', async () => {
    update.mockImplementation(() =>
      Promise.reject(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      ),
    );

    await expect(
      handler.execute(new UpdateUsernameCommand(USER_ID, 'Ada Lovelace')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rethrows other Prisma errors unchanged', async () => {
    const unrelatedError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    update.mockImplementation(() => Promise.reject(unrelatedError));

    await expect(
      handler.execute(new UpdateUsernameCommand(USER_ID, 'Ada Lovelace')),
    ).rejects.toBe(unrelatedError);
  });
});
