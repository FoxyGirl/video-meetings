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

interface MeetingResponseBody {
  id: string;
  filePath: string | null;
}

interface FileMetadataResponseBody {
  fileOriginalName: string;
  fileMimeType: string;
  fileSize: number;
  fileUploadedAt: string;
}

// Reads a binary response body regardless of Content-Type — supertest/
// superagent only auto-parses a handful of known content types, and the
// stored recording's mimetype (e.g. video/mp4) isn't one of them.
function binaryParser(
  res: NodeJS.EventEmitter,
  callback: (err: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Meeting file metadata, download, and delete (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `file-mgmt-user-${Date.now()}-${userCounter++}@example.com`;

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

  async function uploadFile(
    meetingId: string,
    token: string,
    options: { buffer?: Buffer; filename?: string; contentType?: string } = {},
  ): Promise<MeetingResponseBody> {
    const response = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/file`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', options.buffer ?? Buffer.from('fake mp4 bytes'), {
        filename: options.filename ?? 'recording.mp4',
        contentType: options.contentType ?? 'video/mp4',
      })
      .expect(201);

    return response.body as MeetingResponseBody;
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

  describe('GET /meetings/:id/file', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${NONEXISTENT_ID}/file`)
        .expect(401);
    });

    it('returns 404 for a meeting that does not exist', async () => {
      const { accessToken } = await registerUser();

      await request(app.getHttpServer())
        .get(`/meetings/${NONEXISTENT_ID}/file`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns 404 when the meeting has no file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns file metadata for any authenticated user, not just the organizer', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);
      await uploadFile(meetingId, owner.accessToken, {
        buffer: Buffer.from('fake mp4 bytes'),
        filename: 'recording.mp4',
        contentType: 'video/mp4',
      });

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);

      const body = response.body as FileMetadataResponseBody;
      expect(body.fileOriginalName).toBe('recording.mp4');
      expect(body.fileMimeType).toBe('video/mp4');
      expect(body.fileSize).toBe(Buffer.from('fake mp4 bytes').length);
      expect(body.fileUploadedAt).not.toBeNull();
    });
  });

  describe('GET /meetings/:id/file/download', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${NONEXISTENT_ID}/file/download`)
        .expect(401);
    });

    it('returns 404 when the meeting has no file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file/download`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('streams the file content with correct headers for any authenticated user', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);
      const fileContent = Buffer.from('the actual recording bytes');
      await uploadFile(meetingId, owner.accessToken, {
        buffer: fileContent,
        filename: 'recording.mp4',
        contentType: 'video/mp4',
      });

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file/download`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200)
        .expect('Content-Type', 'video/mp4');

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain(
        'recording.mp4',
      );
      expect(response.body as Buffer).toEqual(fileContent);
    });
  });

  describe('DELETE /meetings/:id/file', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .delete(`/meetings/${NONEXISTENT_ID}/file`)
        .expect(401);
    });

    it('returns 404 for a meeting that does not exist', async () => {
      const { accessToken } = await registerUser();

      await request(app.getHttpServer())
        .delete(`/meetings/${NONEXISTENT_ID}/file`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('rejects a non-organizer delete', async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const meetingId = await createMeeting(owner.accessToken);
      await uploadFile(meetingId, owner.accessToken);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/file`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });

    it('returns 404 when the meeting has no file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/file`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('deletes the file and a subsequent metadata fetch reflects no file present', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);
      const uploaded = await uploadFile(meetingId, accessToken);
      const storedPath = `${UPLOAD_DIR}/${uploaded.filePath}`;
      expect(existsSync(storedPath)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/file`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(existsSync(storedPath)).toBe(false);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/file`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('serializes a concurrent delete and re-upload without orphaning a file', async () => {
      const { accessToken } = await registerUser();
      const meetingId = await createMeeting(accessToken);

      const initial = await uploadFile(meetingId, accessToken, {
        buffer: Buffer.from('initial version'),
        filename: 'initial.mp4',
        contentType: 'video/mp4',
      });
      const initialStoredPath = `${UPLOAD_DIR}/${initial.filePath}`;
      expect(existsSync(initialStoredPath)).toBe(true);

      const [deleteResponse, uploadResponse] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/meetings/${meetingId}/file`)
          .set('Authorization', `Bearer ${accessToken}`),
        request(app.getHttpServer())
          .post(`/meetings/${meetingId}/file`)
          .set('Authorization', `Bearer ${accessToken}`)
          .attach('file', Buffer.from('replacement version'), {
            filename: 'replacement.mp4',
            contentType: 'video/mp4',
          }),
      ]);

      // Whichever of the two committed first, the row lock in
      // DeleteMeetingFileHandler/UploadMeetingFileHandler means the delete
      // always finds *some* file present (the initial one, or the
      // just-committed replacement) — it never races against a stale read.
      expect(deleteResponse.status).toBe(200);
      expect(uploadResponse.status).toBe(201);

      // The initial file must be gone from disk by now regardless of
      // ordering: either the delete removed it directly, or the reupload's
      // own replace-on-reupload cleanup did.
      expect(existsSync(initialStoredPath)).toBe(false);

      const finalMeeting = (
        await request(app.getHttpServer())
          .get(`/meetings/${meetingId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
      ).body as MeetingResponseBody;
      const replacementPath = (uploadResponse.body as MeetingResponseBody)
        .filePath as string;

      if (finalMeeting.filePath) {
        // The reupload committed last: its file must be the one left
        // referenced and present on disk.
        expect(finalMeeting.filePath).toBe(replacementPath);
        expect(existsSync(`${UPLOAD_DIR}/${finalMeeting.filePath}`)).toBe(true);
      } else {
        // The delete committed last: no file should remain anywhere on
        // disk, including the replacement the reupload wrote — this is
        // exactly the orphan a missing row lock would produce.
        expect(existsSync(`${UPLOAD_DIR}/${replacementPath}`)).toBe(false);
      }
    });
  });
});
