import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface AuthResponseBody {
  accessToken: string;
}

interface UserProfileResponseBody {
  id: string;
  email: string;
  username: string | null;
  avatarMimeType: string | null;
  avatarUploadedAt: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('User profile (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{
    accessToken: string;
    email: string;
  }> {
    const email = `profile-user-${Date.now()}-${userCounter++}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Sup3rSecret!' })
      .expect(201);

    return {
      accessToken: (response.body as AuthResponseBody).accessToken,
      email,
    };
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

  describe('GET /users/me', () => {
    it('returns the profile of a freshly registered user', async () => {
      const { accessToken, email } = await registerUser();

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as UserProfileResponseBody;
      expect(body.id).toEqual(expect.stringMatching(UUID_PATTERN));
      expect(body.email).toBe(email);
      expect(body.username).toBeNull();
      expect(body.avatarMimeType).toBeNull();
      expect(body.avatarUploadedAt).toBeNull();
    });

    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });
  });
});
