import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AVATAR_UPLOAD_DIR } from '../src/user/upload/avatar-upload.constants';

const MAX_AVATAR_FILE_SIZE_BYTES =
  Number(process.env.MAX_AVATAR_FILE_SIZE_BYTES) || 5 * 1024 * 1024;

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

// Reads a binary response body regardless of Content-Type — supertest/
// superagent only auto-parses a handful of known content types, and a
// stored avatar's mimetype (e.g. image/png) isn't one of them.
function binaryParser(
  res: NodeJS.EventEmitter,
  callback: (err: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('User avatar upload and serving (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `avatar-user-${Date.now()}-${userCounter++}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Sup3rSecret!' })
      .expect(201);

    return { accessToken: (response.body as AuthResponseBody).accessToken };
  }

  function uploadRequest(token: string) {
    return request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${token}`);
  }

  async function getProfile(token: string): Promise<UserProfileResponseBody> {
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return response.body as UserProfileResponseBody;
  }

  async function listUploadedFiles(): Promise<string[]> {
    return existsSync(AVATAR_UPLOAD_DIR) ? readdir(AVATAR_UPLOAD_DIR) : [];
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
    if (existsSync(AVATAR_UPLOAD_DIR)) {
      await rm(AVATAR_UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  describe('POST /users/me/avatar', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .attach('file', Buffer.from('fake png bytes'), {
          filename: 'avatar.png',
          contentType: 'image/png',
        })
        .expect(401);
    });

    it('uploads a valid accepted-type image, persists its metadata, and serves it back', async () => {
      const { accessToken } = await registerUser();
      const content = Buffer.from('fake png bytes');

      const response = await uploadRequest(accessToken)
        .attach('file', content, {
          filename: 'avatar.png',
          contentType: 'image/png',
        })
        .expect(201);

      const body = response.body as UserProfileResponseBody;
      expect(body.avatarMimeType).toBe('image/png');
      expect(body.avatarUploadedAt).not.toBeNull();

      const download = await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', 'image/png');

      expect(download.body as Buffer).toEqual(content);
    });

    it('rejects a disallowed file extension and persists no metadata', async () => {
      const { accessToken } = await registerUser();
      const before = await getProfile(accessToken);
      const filesBefore = await listUploadedFiles();

      const response = await uploadRequest(accessToken)
        .attach('file', Buffer.from('not an image'), {
          filename: 'malware.exe',
          contentType: 'application/octet-stream',
        })
        .expect(400);

      // Confirms the "bad extension" branch fired, not some other 400.
      expect((response.body as { message: string }).message).toContain(
        'extension ".exe" is not supported',
      );

      const after = await getProfile(accessToken);
      expect(after.avatarMimeType).toBe(before.avatarMimeType);
      expect(after.avatarUploadedAt).toBe(before.avatarUploadedAt);
      expect(await listUploadedFiles()).toEqual(filesBefore);
    });

    it('rejects a disallowed MIME type and persists no metadata', async () => {
      const { accessToken } = await registerUser();
      const before = await getProfile(accessToken);
      const filesBefore = await listUploadedFiles();

      const response = await uploadRequest(accessToken)
        .attach('file', Buffer.from('fake png bytes'), {
          filename: 'avatar.png',
          contentType: 'application/octet-stream',
        })
        .expect(400);

      // Confirms the "bad MIME type" branch fired, not the mismatch branch.
      expect((response.body as { message: string }).message).toContain(
        'MIME type "application/octet-stream" is not supported',
      );

      const after = await getProfile(accessToken);
      expect(after.avatarMimeType).toBe(before.avatarMimeType);
      expect(after.avatarUploadedAt).toBe(before.avatarUploadedAt);
      expect(await listUploadedFiles()).toEqual(filesBefore);
    });

    it('rejects an extension/MIME type mismatch and persists no metadata', async () => {
      const { accessToken } = await registerUser();
      const before = await getProfile(accessToken);
      const filesBefore = await listUploadedFiles();

      const response = await uploadRequest(accessToken)
        .attach('file', Buffer.from('fake webp bytes'), {
          filename: 'avatar.png',
          contentType: 'image/webp',
        })
        .expect(400);

      // Confirms the mismatch branch fired: both the extension (.png) and
      // the MIME type (image/webp, valid for .webp) are individually
      // accepted, only their pairing isn't — a different code path than
      // either of the two tests above.
      expect((response.body as { message: string }).message).toContain(
        'extension ".png" does not match declared MIME type "image/webp"',
      );

      const after = await getProfile(accessToken);
      expect(after.avatarMimeType).toBe(before.avatarMimeType);
      expect(after.avatarUploadedAt).toBe(before.avatarUploadedAt);
      expect(await listUploadedFiles()).toEqual(filesBefore);
    });

    it('rejects an oversized file and persists no metadata', async () => {
      const { accessToken } = await registerUser();
      const before = await getProfile(accessToken);
      const filesBefore = await listUploadedFiles();

      await uploadRequest(accessToken)
        .attach('file', Buffer.alloc(MAX_AVATAR_FILE_SIZE_BYTES + 1), {
          filename: 'avatar.png',
          contentType: 'image/png',
        })
        .expect(413);

      const after = await getProfile(accessToken);
      expect(after.avatarMimeType).toBe(before.avatarMimeType);
      expect(after.avatarUploadedAt).toBe(before.avatarUploadedAt);
      expect(await listUploadedFiles()).toEqual(filesBefore);
    });

    it('replaces an existing avatar on re-upload, removing the old file from disk', async () => {
      const { accessToken } = await registerUser();
      const filesBeforeFirst = await listUploadedFiles();

      await uploadRequest(accessToken)
        .attach('file', Buffer.from('first avatar'), {
          filename: 'first.png',
          contentType: 'image/png',
        })
        .expect(201);

      const filesAfterFirst = await listUploadedFiles();
      const firstFile = filesAfterFirst.find(
        (name) => !filesBeforeFirst.includes(name),
      );
      expect(firstFile).toBeDefined();
      expect(existsSync(join(AVATAR_UPLOAD_DIR, firstFile as string))).toBe(
        true,
      );

      const second = await uploadRequest(accessToken)
        .attach('file', Buffer.from('second avatar, longer content'), {
          filename: 'second.webp',
          contentType: 'image/webp',
        })
        .expect(201);

      const secondBody = second.body as UserProfileResponseBody;
      expect(secondBody.avatarMimeType).toBe('image/webp');
      expect(existsSync(join(AVATAR_UPLOAD_DIR, firstFile as string))).toBe(
        false,
      );

      const download = await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', 'image/webp');

      expect(download.body as Buffer).toEqual(
        Buffer.from('second avatar, longer content'),
      );
    });
  });

  describe('GET /users/me/avatar', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/users/me/avatar').expect(401);
    });

    it('returns 404 for a user with no avatar', async () => {
      const { accessToken } = await registerUser();

      await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
