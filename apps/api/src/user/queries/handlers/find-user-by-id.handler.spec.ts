import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaService } from '../../../prisma/prisma.service';
import { FindUserByIdQuery } from '../find-user-by-id.query';
import { FindUserByIdHandler } from './find-user-by-id.handler';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('FindUserByIdHandler', () => {
  let findUnique: jest.Mock;
  let handler: FindUserByIdHandler;

  beforeEach(() => {
    findUnique = jest.fn();
    handler = new FindUserByIdHandler({
      user: { findUnique },
    } as unknown as PrismaService);
  });

  it('returns the id, email, and password hash for an existing user', async () => {
    findUnique.mockImplementation(() =>
      Promise.resolve({
        id: USER_ID,
        email: 'ada@example.com',
        password: 'hashed-password',
      }),
    );

    const result = await handler.execute(new FindUserByIdQuery(USER_ID));

    expect(findUnique).toHaveBeenCalledWith({ where: { id: USER_ID } });
    expect(result).toEqual({
      id: USER_ID,
      email: 'ada@example.com',
      password: 'hashed-password',
    });
  });

  it('returns null when no user matches the id', async () => {
    findUnique.mockImplementation(() => Promise.resolve(null));

    const result = await handler.execute(new FindUserByIdQuery(USER_ID));

    expect(result).toBeNull();
  });
});
