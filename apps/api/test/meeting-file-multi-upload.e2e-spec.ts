import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { getUploadDir } from '../src/meetings/upload/file-upload.constants';

// Jest's setupFiles (jest-e2e.setup.ts) load .env.test before this file is
// required, so it's safe to resolve this once for the whole suite.
const UPLOAD_DIR = getUploadDir();
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

interface AuthResponseBody {
  accessToken: string;
}

interface MeetingFileMetadataBody {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  transcriptionStatus: string | null;
  transcriptionText: string | null;
}

interface UploadBatchResponseBody {
  accepted: MeetingFileMetadataBody[];
  rejected: { originalName: string; reason: string }[];
}

describe('Meeting multi-file upload (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `multi-upload-user-${Date.now()}-${userCounter++}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Sup3rSecret!' })
      .expect(201);

    return { accessToken: (response.body as AuthResponseBody).accessToken };
  }

  async function createMeeting(token: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sprint Planning',
        date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        participants: [],
      })
      .expect(201);

    return (response.body as { id: string }).id;
  }

  function uploadRequest(meetingId: string, token: string) {
    return request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function uploadOne(
    meetingId: string,
    token: string,
    filename: string,
  ): Promise<MeetingFileMetadataBody> {
    const response = await uploadRequest(meetingId, token)
      .attach('files', Buffer.from(`content for ${filename}`), {
        filename,
        contentType: 'video/mp4',
      })
      .expect(201);

    return (response.body as UploadBatchResponseBody).accepted[0];
  }

  async function listFiles(
    meetingId: string,
    token: string,
  ): Promise<MeetingFileMetadataBody[]> {
    const response = await request(app.getHttpServer())
      .get(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return response.body as MeetingFileMetadataBody[];
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
    if (existsSync(UPLOAD_DIR)) {
      await rm(UPLOAD_DIR, { recursive: true, force: true });
    }
  });

  describe('POST /meetings/:id/files', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${NONEXISTENT_ID}/files`)
        .attach('files', Buffer.from('fake mp4 bytes'), {
          filename: 'recording.mp4',
          contentType: 'video/mp4',
        })
        .expect(401);
    });

    it('rejects a non-organizer upload', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);

      await uploadRequest(meetingId, other.accessToken)
        .attach('files', Buffer.from('fake mp4 bytes'), {
          filename: 'recording.mp4',
          contentType: 'video/mp4',
        })
        .expect(404);
    });

    it('persists several files from one request as their own rows, without touching an existing one', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);
      const existing = await uploadOne(meetingId, accessToken, 'first.mp4');

      const response = await uploadRequest(meetingId, accessToken)
        .attach('files', Buffer.from('second file'), {
          filename: 'second.mp4',
          contentType: 'video/mp4',
        })
        .attach('files', Buffer.from('third file'), {
          filename: 'third.mp4',
          contentType: 'video/mp4',
        })
        .expect(201);

      const body = response.body as UploadBatchResponseBody;
      expect(body.accepted).toHaveLength(2);
      expect(body.rejected).toHaveLength(0);
      expect(body.accepted.map((f) => f.originalName).sort()).toEqual([
        'second.mp4',
        'third.mp4',
      ]);

      const files = await listFiles(meetingId, accessToken);
      expect(files).toHaveLength(3);
      expect(files.map((f) => f.id)).toContain(existing.id);
    });

    it('persists only the valid file from a mixed valid/invalid batch, reporting the invalid one individually', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      const response = await uploadRequest(meetingId, accessToken)
        .attach('files', Buffer.from('a real video'), {
          filename: 'good.mp4',
          contentType: 'video/mp4',
        })
        .attach('files', Buffer.from('not a video'), {
          filename: 'bad.exe',
          contentType: 'application/octet-stream',
        })
        .expect(201);

      const body = response.body as UploadBatchResponseBody;
      expect(body.accepted).toHaveLength(1);
      expect(body.accepted[0].originalName).toBe('good.mp4');
      expect(body.rejected).toHaveLength(1);
      expect(body.rejected[0].originalName).toBe('bad.exe');
      expect(body.rejected[0].reason).toContain('extension ".exe"');

      const files = await listFiles(meetingId, accessToken);
      expect(files).toHaveLength(1);
      expect(files[0].originalName).toBe('good.mp4');
    });

    it('persists only the within-limit file from a mixed valid/oversized batch, reporting the oversized one individually', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);
      // .env.test lowers MAX_UPLOAD_FILE_SIZE_BYTES to 1 MB specifically so
      // this can trip the real per-file limit without allocating hundreds
      // of MB — see that file's own comment. 1.5 MB stays comfortably under
      // Multer's own (looser) MULTER_FILE_SIZE_HARD_LIMIT_BYTES ceiling, so
      // it streams to disk fully and reaches the handler's authoritative
      // check instead of aborting the whole request.
      const OVERSIZED_BYTES = 1.5 * 1024 * 1024;

      const response = await uploadRequest(meetingId, accessToken)
        .attach('files', Buffer.from('a real video'), {
          filename: 'good.mp4',
          contentType: 'video/mp4',
        })
        .attach('files', Buffer.alloc(OVERSIZED_BYTES), {
          filename: 'too-big.mp4',
          contentType: 'video/mp4',
        })
        .expect(201);

      const body = response.body as UploadBatchResponseBody;
      expect(body.accepted).toHaveLength(1);
      expect(body.accepted[0].originalName).toBe('good.mp4');
      expect(body.rejected).toHaveLength(1);
      expect(body.rejected[0].originalName).toBe('too-big.mp4');
      expect(body.rejected[0].reason).toContain('exceeds the maximum size');

      const files = await listFiles(meetingId, accessToken);
      expect(files).toHaveLength(1);
      expect(files[0].originalName).toBe('good.mp4');
    });

    it('rejects an upload past the 10-file cap and leaves the count at 10', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      for (let i = 0; i < 10; i++) {
        await uploadOne(meetingId, accessToken, `file-${i}.mp4`);
      }

      const response = await uploadRequest(meetingId, accessToken)
        .attach('files', Buffer.from('eleventh file'), {
          filename: 'eleventh.mp4',
          contentType: 'video/mp4',
        })
        .expect(201);

      const body = response.body as UploadBatchResponseBody;
      expect(body.accepted).toHaveLength(0);
      expect(body.rejected).toHaveLength(1);
      expect(body.rejected[0].originalName).toBe('eleventh.mp4');
      expect(body.rejected[0].reason).toContain('maximum of 10 files');

      const files = await listFiles(meetingId, accessToken);
      expect(files).toHaveLength(10);
    });

    it('accepts only as many files from a batch as remain under the cap, rejecting the rest', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      for (let i = 0; i < 8; i++) {
        await uploadOne(meetingId, accessToken, `file-${i}.mp4`);
      }

      const req = uploadRequest(meetingId, accessToken);
      for (let i = 0; i < 4; i++) {
        req.attach('files', Buffer.from(`extra ${i}`), {
          filename: `extra-${i}.mp4`,
          contentType: 'video/mp4',
        });
      }
      const response = await req.expect(201);

      const body = response.body as UploadBatchResponseBody;
      expect(body.accepted).toHaveLength(2);
      expect(body.rejected).toHaveLength(2);
      expect(
        body.rejected.every((r) => r.reason.includes('maximum of 10 files')),
      ).toBe(true);

      const files = await listFiles(meetingId, accessToken);
      expect(files).toHaveLength(10);
    });
  });

  describe('GET /meetings/:id/files', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${NONEXISTENT_ID}/files`)
        .expect(401);
    });

    it('returns 404 for a meeting that does not exist', async () => {
      const { accessToken } = await registerUser();

      await request(app.getHttpServer())
        .get(`/meetings/${NONEXISTENT_ID}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns an empty list for a meeting with no files', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      const files = await listFiles(meetingId, accessToken);
      expect(files).toEqual([]);
    });

    it('lists every file for any authenticated user, not just the organizer', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);
      await uploadOne(meetingId, owner.accessToken, 'recording.mp4');

      const files = await listFiles(meetingId, other.accessToken);
      expect(files).toHaveLength(1);
      expect(files[0].originalName).toBe('recording.mp4');
    });
  });

  describe('GET /meetings/:id/files/:fileId/download', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${NONEXISTENT_ID}/files/${NONEXISTENT_ID}/download`)
        .expect(401);
    });

    it('returns 404 for a fileId that does not belong to the meeting', async () => {
      const { accessToken } = await registerUser();
      const meetingA = await createMeeting(accessToken);
      const meetingB = await createMeeting(accessToken);
      const fileOnA = await uploadOne(meetingA, accessToken, 'a.mp4');

      await request(app.getHttpServer())
        .get(`/meetings/${meetingB}/files/${fileOnA.id}/download`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('streams the file content for any authenticated user', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);
      const fileContent = Buffer.from('the actual recording bytes');

      const uploadResponse = await uploadRequest(meetingId, owner.accessToken)
        .attach('files', fileContent, {
          filename: 'recording.mp4',
          contentType: 'video/mp4',
        })
        .expect(201);
      const file = (uploadResponse.body as UploadBatchResponseBody).accepted[0];

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${file.id}/download`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200)
        .expect('Content-Type', 'video/mp4');

      expect(response.headers['content-disposition']).toContain(
        'recording.mp4',
      );
      expect(response.body as Buffer).toEqual(fileContent);
    });
  });

  describe('DELETE /meetings/:id/files/:fileId', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .delete(`/meetings/${NONEXISTENT_ID}/files/${NONEXISTENT_ID}`)
        .expect(401);
    });

    it('rejects a non-organizer delete', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);
      const file = await uploadOne(meetingId, owner.accessToken, 'a.mp4');

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${file.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });

    it('deletes only the targeted file, leaving the others on the same meeting untouched', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);
      const fileA = await uploadOne(meetingId, accessToken, 'a.mp4');
      const fileB = await uploadOne(meetingId, accessToken, 'b.mp4');

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${fileA.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const files = await listFiles(meetingId, accessToken);
      expect(files).toHaveLength(1);
      expect(files[0].id).toBe(fileB.id);
      expect(files[0].originalName).toBe('b.mp4');

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileA.id}/download`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /meetings/:id/files/:fileId/transcription/refresh', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post(
          `/meetings/${NONEXISTENT_ID}/files/${NONEXISTENT_ID}/transcription/refresh`,
        )
        .expect(401);
    });

    it('rejects a non-organizer refresh', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);
      const file = await uploadOne(meetingId, owner.accessToken, 'a.mp4');

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files/${file.id}/transcription/refresh`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });

    it('returns 404 for a fileId that does not belong to the meeting', async () => {
      const { accessToken } = await registerUser();
      const meetingA = await createMeeting(accessToken);
      const meetingB = await createMeeting(accessToken);
      const fileOnA = await uploadOne(meetingA, accessToken, 'a.mp4');

      await request(app.getHttpServer())
        .post(`/meetings/${meetingB}/files/${fileOnA.id}/transcription/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
