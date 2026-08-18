import { describe, it, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface AuthResponseBody {
  accessToken: string;
}

describe('User password change (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(
    password = 'Sup3rSecret!',
  ): Promise<{ accessToken: string; email: string; password: string }> {
    const email = `password-user-${Date.now()}-${userCounter++}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    return {
      accessToken: (response.body as AuthResponseBody).accessToken,
      email,
      password,
    };
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PATCH /users/me/password', () => {
    it('changes the password, allowing login with the new one and rejecting the old', async () => {
      const { accessToken, email, password } = await registerUser();
      const newPassword = 'N3wSecret!';

      await request(app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: password, newPassword })
        .expect(200);

      await login(email, newPassword).expect(200);
      await login(email, password).expect(401);
    });

    it('rejects an incorrect current password, leaving the password unchanged', async () => {
      const { accessToken, email, password } = await registerUser();

      await request(app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'WrongCurrent1!', newPassword: 'N3wSecret!' })
        .expect(401);

      await login(email, password).expect(200);
    });

    it('rejects a new password shorter than 8 characters, leaving the password unchanged', async () => {
      const { accessToken, email, password } = await registerUser();

      await request(app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: password, newPassword: 'short' })
        .expect(400);

      await login(email, password).expect(200);
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .patch('/users/me/password')
        .send({ currentPassword: 'whatever1', newPassword: 'N3wSecret!' })
        .expect(401);
    });
  });
});
