import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface AuthResponseBody {
  accessToken: string;
}

interface MeetingResponseBody {
  id: string;
  title: string;
  date: string;
  participants: string[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function expectMeetingShape(
  body: MeetingResponseBody,
  expected: { title: string; date: string; participants: string[] },
) {
  expect(body.id).toEqual(expect.stringMatching(UUID_PATTERN));
  expect(body.title).toBe(expected.title);
  expect(body.date).toBe(expected.date);
  expect(body.participants).toEqual(
    expect.arrayContaining(expected.participants),
  );
  expect(body.participants).toHaveLength(expected.participants.length);
}

describe('Meetings (e2e)', () => {
  let app: INestApplication<App>;
  let userCounter = 0;

  async function registerUser(): Promise<{
    accessToken: string;
    email: string;
  }> {
    const email = `meetings-user-${Date.now()}-${userCounter++}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Sup3rSecret!' })
      .expect(201);

    return {
      accessToken: (response.body as AuthResponseBody).accessToken,
      email,
    };
  }

  function authedRequest(method: 'get' | 'post', url: string, token: string) {
    return request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`);
  }

  async function createMeeting(
    token: string,
    overrides: Partial<{
      title: string;
      date: string;
      participants: string[];
    }> = {},
  ) {
    const body = {
      title: 'Sprint Planning',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      participants: ['alice@example.com', 'bob@example.com'],
      ...overrides,
    };

    const response = await authedRequest('post', '/meetings', token)
      .send(body)
      .expect(201);

    return { body, response };
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

  describe('POST /meetings', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .send({
          title: 'Sprint Planning',
          date: new Date().toISOString(),
          participants: ['alice@example.com'],
        })
        .expect(401);
    });

    it('creates a meeting for the authenticated user', async () => {
      const { accessToken } = await registerUser();
      const { body, response } = await createMeeting(accessToken);

      expectMeetingShape(response.body as MeetingResponseBody, body);
    });

    it('creates a meeting with an empty participants list', async () => {
      const { accessToken } = await registerUser();

      const { body, response } = await createMeeting(accessToken, {
        participants: [],
      });

      expectMeetingShape(response.body as MeetingResponseBody, body);
    });

    it.each([
      [
        'missing title',
        { date: new Date().toISOString(), participants: ['a@example.com'] },
      ],
      ['missing date', { title: 'Sprint Planning', participants: [] }],
      [
        'missing participants',
        { title: 'Sprint Planning', date: new Date().toISOString() },
      ],
      [
        'malformed date',
        {
          title: 'Sprint Planning',
          date: 'not-a-date',
          participants: [],
        },
      ],
      [
        'participants not an array',
        {
          title: 'Sprint Planning',
          date: new Date().toISOString(),
          participants: 'alice@example.com',
        },
      ],
      [
        'a participant that is not a valid email',
        {
          title: 'Sprint Planning',
          date: new Date().toISOString(),
          participants: ['not-an-email'],
        },
      ],
    ])('rejects meeting creation with %s', async (_case, body) => {
      const { accessToken } = await registerUser();

      await authedRequest('post', '/meetings', accessToken)
        .send(body)
        .expect(400);
    });
  });

  describe('GET /meetings', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer()).get('/meetings').expect(401);
    });

    it('returns an empty list for a user with no meetings', async () => {
      const { accessToken } = await registerUser();

      const response = await authedRequest(
        'get',
        '/meetings',
        accessToken,
      ).expect(200);

      expect(response.body).toEqual([]);
    });

    it("returns only the authenticated user's meetings", async () => {
      const owner = await registerUser();
      const other = await registerUser();

      const { body: firstMeeting } = await createMeeting(owner.accessToken, {
        title: 'Owner Meeting One',
      });
      const { body: secondMeeting } = await createMeeting(owner.accessToken, {
        title: 'Owner Meeting Two',
      });
      await createMeeting(other.accessToken, { title: "Other's Meeting" });

      const response = await authedRequest(
        'get',
        '/meetings',
        owner.accessToken,
      ).expect(200);

      const titles = (response.body as MeetingResponseBody[]).map(
        (meeting) => meeting.title,
      );
      expect(titles).toEqual(
        expect.arrayContaining([firstMeeting.title, secondMeeting.title]),
      );
      expect(titles).toHaveLength(2);
      expect(titles).not.toContain("Other's Meeting");
    });
  });

  describe('GET /meetings/:id', () => {
    it('rejects an unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/meetings/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });

    it('returns 404 for a meeting that does not exist', async () => {
      const { accessToken } = await registerUser();

      await authedRequest(
        'get',
        '/meetings/00000000-0000-0000-0000-000000000000',
        accessToken,
      ).expect(404);
    });

    it('returns the meeting by id for its owner', async () => {
      const { accessToken } = await registerUser();
      const { body, response: createResponse } =
        await createMeeting(accessToken);
      const created = createResponse.body as MeetingResponseBody;

      const response = await authedRequest(
        'get',
        `/meetings/${created.id}`,
        accessToken,
      ).expect(200);

      expectMeetingShape(response.body as MeetingResponseBody, body);
    });

    it('returns 404 for a meeting that belongs to another user', async () => {
      const owner = await registerUser();
      const intruder = await registerUser();

      const { response: createResponse } = await createMeeting(
        owner.accessToken,
      );
      const created = createResponse.body as MeetingResponseBody;

      await authedRequest(
        'get',
        `/meetings/${created.id}`,
        intruder.accessToken,
      ).expect(404);
    });
  });
});
