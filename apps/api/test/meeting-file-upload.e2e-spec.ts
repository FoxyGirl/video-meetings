import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { UPLOAD_DIR } from '../src/meetings/upload/file-upload.constants';

interface AuthResponseBody {
  accessToken: string;
}

interface MeetingResponseBody {
  id: string;
  fileOriginalName: string | null;
  filePath: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  fileUploadedAt: string | null;
}

describe('Meeting file upload (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `file-upload-user-${Date.now()}-${userCounter++}@example.com`;

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
      .post(`/meetings/${meetingId}/file`)
      .set('Authorization', `Bearer ${token}`);
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

  describe('POST /meetings/:id/file', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/meetings/00000000-0000-0000-0000-000000000000/file')
        .attach('file', Buffer.from('fake mp4 bytes'), {
          filename: 'recording.mp4',
          contentType: 'video/mp4',
        })
        .expect(401);
    });

    it('uploads a valid accepted-type file and persists its metadata', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      const response = await uploadRequest(meetingId, accessToken)
        .attach('file', Buffer.from('fake mp4 bytes'), {
          filename: 'recording.mp4',
          contentType: 'video/mp4',
        })
        .expect(201);

      const body = response.body as MeetingResponseBody;
      expect(body.fileOriginalName).toBe('recording.mp4');
      expect(body.fileMimeType).toBe('video/mp4');
      expect(body.fileSize).toBe(Buffer.from('fake mp4 bytes').length);
      expect(body.fileUploadedAt).not.toBeNull();
      expect(body.filePath).not.toBeNull();

      const stored = join(UPLOAD_DIR, body.filePath as string);
      expect(existsSync(stored)).toBe(true);
    });

    it('rejects a disallowed file extension and persists no file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);
      const before = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];

      await uploadRequest(meetingId, accessToken)
        .attach('file', Buffer.from('not a video'), {
          filename: 'malware.exe',
          contentType: 'application/octet-stream',
        })
        .expect(400);

      const after = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];
      expect(after).toEqual(before);
    });

    it('rejects a disallowed MIME type and persists no file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);
      const before = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];

      await uploadRequest(meetingId, accessToken)
        .attach('file', Buffer.from('fake mp4 bytes'), {
          filename: 'recording.mp4',
          contentType: 'application/octet-stream',
        })
        .expect(400);

      const after = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];
      expect(after).toEqual(before);
    });

    it('rejects an extension/MIME type mismatch and persists no file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);
      const before = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];

      await uploadRequest(meetingId, accessToken)
        .attach('file', Buffer.from('fake audio bytes'), {
          filename: 'recording.mp4',
          contentType: 'audio/mpeg',
        })
        .expect(400);

      const after = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];
      expect(after).toEqual(before);
    });

    it('rejects an oversized file and persists no file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);
      const before = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];

      await uploadRequest(meetingId, accessToken)
        .attach('file', Buffer.alloc(600 * 1024 * 1024), {
          filename: 'recording.mp4',
          contentType: 'video/mp4',
        })
        .expect(413);

      const after = existsSync(UPLOAD_DIR) ? await readdir(UPLOAD_DIR) : [];
      expect(after).toEqual(before);
    }, 30000);

    it('rejects a non-organizer upload', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);

      await uploadRequest(meetingId, other.accessToken)
        .attach('file', Buffer.from('fake mp4 bytes'), {
          filename: 'recording.mp4',
          contentType: 'video/mp4',
        })
        .expect(404);
    });

    it('replaces an existing file on re-upload, removing the old one from disk', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      const first = await uploadRequest(meetingId, accessToken)
        .attach('file', Buffer.from('first version'), {
          filename: 'first.mp4',
          contentType: 'video/mp4',
        })
        .expect(201);
      const firstBody = first.body as MeetingResponseBody;
      const firstStoredPath = join(UPLOAD_DIR, firstBody.filePath as string);
      expect(existsSync(firstStoredPath)).toBe(true);

      const second = await uploadRequest(meetingId, accessToken)
        .attach('file', Buffer.from('second version, longer content'), {
          filename: 'second.webm',
          contentType: 'video/webm',
        })
        .expect(201);
      const secondBody = second.body as MeetingResponseBody;

      expect(secondBody.fileOriginalName).toBe('second.webm');
      expect(secondBody.filePath).not.toBe(firstBody.filePath);
      expect(existsSync(firstStoredPath)).toBe(false);

      const secondStoredPath = join(UPLOAD_DIR, secondBody.filePath as string);
      expect(existsSync(secondStoredPath)).toBe(true);
    });

    it('serializes concurrent re-uploads to the same meeting without orphaning a file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      const [first, second] = await Promise.all([
        uploadRequest(meetingId, accessToken).attach(
          'file',
          Buffer.from('version A'),
          { filename: 'a.mp4', contentType: 'video/mp4' },
        ),
        uploadRequest(meetingId, accessToken).attach(
          'file',
          Buffer.from('version B, a bit longer'),
          { filename: 'b.webm', contentType: 'video/webm' },
        ),
      ]);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);

      const firstBody = first.body as MeetingResponseBody;
      const secondBody = second.body as MeetingResponseBody;
      expect(firstBody.filePath).not.toBe(secondBody.filePath);

      const finalResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const finalFilePath = (finalResponse.body as MeetingResponseBody)
        .filePath as string;

      const candidatePaths = [firstBody.filePath, secondBody.filePath];
      expect(candidatePaths).toContain(finalFilePath);
      const losingFilePath = candidatePaths.find(
        (path) => path !== finalFilePath,
      ) as string;

      // The row that lost the race must have had its file cleaned up by
      // whichever request committed second (per the row lock in
      // UploadMeetingFileHandler) — no orphaned file left on disk.
      expect(existsSync(join(UPLOAD_DIR, finalFilePath))).toBe(true);
      expect(existsSync(join(UPLOAD_DIR, losingFilePath))).toBe(false);
    });
  });
});
