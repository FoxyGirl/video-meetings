import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../prisma/generated/prisma/client';
import { AppModule } from './../src/app.module';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface AuthResponseBody {
  accessToken: string;
}

function expectJwt(token: unknown) {
  expect(typeof token).toBe('string');
  const parts = (token as string).split('.');
  expect(parts).toHaveLength(3);
  parts.forEach((part) => expect(part.length).toBeGreaterThan(0));
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /auth/register', () => {
    it('creates a user and returns a JWT', async () => {
      const email = `new-user-${Date.now()}@example.com`;
      const password = 'Sup3rSecret!';

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      expectJwt((response.body as AuthResponseBody).accessToken);

      const stored = await prisma.user.findUnique({ where: { email } });
      expect(stored).not.toBeNull();
      expect(stored?.password).not.toBe(password);
    });

    it('rejects registration when the email is already taken', async () => {
      const email = `duplicate-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'Sup3rSecret!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'AnotherPass1!' })
        .expect(409);

      const users = await prisma.user.findMany({ where: { email } });
      expect(users).toHaveLength(1);
    });

    it.each([
      ['missing email', { password: 'Sup3rSecret!' }],
      ['missing password', { email: 'missing-password@example.com' }],
      ['malformed email', { email: 'not-an-email', password: 'Sup3rSecret!' }],
    ])('rejects registration with %s', async (_case, body) => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(body)
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in an existing user and returns a JWT without creating a new user', async () => {
      const email = `login-${Date.now()}@example.com`;
      const password = 'Sup3rSecret!';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const usersBefore = await prisma.user.count();

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      expectJwt((response.body as AuthResponseBody).accessToken);
      expect(await prisma.user.count()).toBe(usersBefore);
    });

    it('rejects login for an email that was never registered, without creating one', async () => {
      const email = `ghost-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'whatever' })
        .expect(401);

      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it('rejects login with an incorrect password', async () => {
      const email = `wrong-pass-${Date.now()}@example.com`;

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'Correct1!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Incorrect1!' })
        .expect(401);
    });
  });
});
