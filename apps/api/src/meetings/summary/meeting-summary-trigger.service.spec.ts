import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CommandBus } from '@nestjs/cqrs';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerateMeetingSummaryCommand } from '../commands/generate-meeting-summary.command';
import { MeetingSummaryTriggerService } from './meeting-summary-trigger.service';

const MEETING_ID = '11111111-1111-4111-8111-111111111111';

interface FileStatus {
  transcriptionStatus: string | null;
}

function buildFile(transcriptionStatus: string | null): FileStatus {
  return { transcriptionStatus };
}

describe('MeetingSummaryTriggerService', () => {
  let findMany: jest.Mock<() => Promise<FileStatus[]>>;
  let updateMany: jest.Mock;
  let execute: jest.Mock;
  let service: MeetingSummaryTriggerService;

  beforeEach(() => {
    findMany = jest.fn();
    updateMany = jest.fn(() => Promise.resolve({ count: 1 }));
    execute = jest.fn(() => Promise.resolve());

    service = new MeetingSummaryTriggerService(
      {
        meetingFile: { findMany },
        meeting: { updateMany },
      } as unknown as PrismaService,
      { execute } as unknown as CommandBus,
    );
  });

  it('does nothing when a sibling file is still not terminal', async () => {
    findMany.mockResolvedValue([
      buildFile('COMPLETED'),
      buildFile('PROCESSING'),
    ]);

    await service.maybeTrigger(MEETING_ID);

    expect(updateMany).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('does nothing when every file is terminal but none completed', async () => {
    findMany.mockResolvedValue([buildFile('FAILED'), buildFile('FAILED')]);

    await service.maybeTrigger(MEETING_ID);

    expect(updateMany).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('writes PENDING with a fresh token and dispatches generation once all files are terminal with at least one completed', async () => {
    findMany.mockResolvedValue([buildFile('COMPLETED'), buildFile('FAILED')]);

    await service.maybeTrigger(MEETING_ID);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: MEETING_ID,
        OR: [{ summaryStatus: null }, { summaryStatus: { not: 'PROCESSING' } }],
      },
      data: {
        summaryStatus: 'PENDING',
        summaryGenerationToken: expect.any(String),
      },
    });

    const dispatchedToken = (
      updateMany.mock.calls[0][0] as {
        data: { summaryGenerationToken: string };
      }
    ).data.summaryGenerationToken;
    expect(execute).toHaveBeenCalledWith(
      new GenerateMeetingSummaryCommand(MEETING_ID, dispatchedToken),
    );
  });

  it('stamps a different token on each call', async () => {
    findMany.mockResolvedValue([buildFile('COMPLETED')]);

    await service.maybeTrigger(MEETING_ID);
    await service.maybeTrigger(MEETING_ID);

    const [firstToken, secondToken] = updateMany.mock.calls.map(
      (call) =>
        (call[0] as { data: { summaryGenerationToken: string } }).data
          .summaryGenerationToken,
    );
    expect(firstToken).not.toBe(secondToken);
  });

  it('triggers for a meeting with only one, completed file', async () => {
    findMany.mockResolvedValue([buildFile('COMPLETED')]);

    await service.maybeTrigger(MEETING_ID);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('logs, rather than throws, when the dispatch itself rejects', async () => {
    findMany.mockResolvedValue([buildFile('COMPLETED')]);
    execute.mockImplementation(() => Promise.reject(new Error('boom')));
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(service.maybeTrigger(MEETING_ID)).resolves.toBeUndefined();
    // Let the unhandled dispatch promise's .catch() run.
    await new Promise((resolve) => setImmediate(resolve));

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('logs, rather than throws, when the trigger read itself rejects', async () => {
    findMany.mockImplementation(() => Promise.reject(new Error('db down')));
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    // Callers in the request path (Upload/Delete/RefreshTranscription/
    // RefreshMeetingSummary handlers) await this directly and return its
    // result as part of the HTTP response — a transient DB error re-checking
    // the trigger must never fail an otherwise-successful primary write.
    await expect(service.maybeTrigger(MEETING_ID)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('logs, rather than throws, when the PENDING/token write itself rejects', async () => {
    findMany.mockResolvedValue([buildFile('COMPLETED')]);
    updateMany.mockImplementation(() => Promise.reject(new Error('db down')));
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(service.maybeTrigger(MEETING_ID)).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
