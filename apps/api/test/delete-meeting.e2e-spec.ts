import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
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
}

interface UploadBatchResponseBody {
  accepted: MeetingFileMetadataBody[];
}

describe('DELETE /meetings/:id (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{ accessToken: string }> {
    const email = `delete-meeting-user-${Date.now()}-${userCounter++}@example.com`;

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

  async function uploadOne(
    meetingId: string,
    token: string,
    filename: string,
  ): Promise<MeetingFileMetadataBody> {
    const response = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/files`)
      .set('Authorization', `Bearer ${token}`)
      .attach('files', Buffer.from(`content for ${filename}`), {
        filename,
        contentType: 'video/mp4',
      })
      .expect(201);

    return (response.body as UploadBatchResponseBody).accepted[0];
  }

  async function listUploadedFiles(): Promise<string[]> {
    return existsSync(UPLOAD_DIR) ? readdir(UPLOAD_DIR) : [];
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

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .delete(`/meetings/${NONEXISTENT_ID}`)
      .expect(401);
  });

  it('returns 404 for a meeting that does not exist', async () => {
    const { accessToken } = await registerUser();

    await request(app.getHttpServer())
      .delete(`/meetings/${NONEXISTENT_ID}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('rejects a non-organizer delete and leaves the meeting intact', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const meetingId = await createMeeting(owner.accessToken);

    await request(app.getHttpServer())
      .delete(`/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
  });

  it('deletes the meeting, its files on disk, and 404s on a subsequent get', async () => {
    const { accessToken } = await registerUser();
    const meetingId = await createMeeting(accessToken);

    const filesBeforeUpload = await listUploadedFiles();
    await uploadOne(meetingId, accessToken, 'a.mp4');
    await uploadOne(meetingId, accessToken, 'b.mp4');
    const filesAfterUpload = await listUploadedFiles();
    const uploadedFiles = filesAfterUpload.filter(
      (f) => !filesBeforeUpload.includes(f),
    );
    expect(uploadedFiles).toHaveLength(2);

    await request(app.getHttpServer())
      .delete(`/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/meetings/${meetingId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    const filesAfterDelete = await listUploadedFiles();
    for (const uploadedFile of uploadedFiles) {
      expect(filesAfterDelete).not.toContain(uploadedFile);
    }
  });
});
