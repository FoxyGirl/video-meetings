import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
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

function buildUser(username: string | null) {
  return {
    id: USER_ID,
    email: 'ada@example.com',
    password: 'hashed',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    username,
    avatarPath: null,
    avatarMimeType: null,
    avatarUploadedAt: null,
  };
}

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
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let handler: UpdateUsernameHandler;

  beforeEach(() => {
    findUnique = jest.fn(() => Promise.resolve(buildUser(null)));
    update = jest.fn(() => Promise.resolve(buildProfile('Ada Lovelace')));

    handler = new UpdateUsernameHandler({
      user: { findUnique, update },
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
    findUnique.mockImplementation(() => Promise.resolve(null));

    await expect(
      handler.execute(new UpdateUsernameCommand(USER_ID, 'Ada Lovelace')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
