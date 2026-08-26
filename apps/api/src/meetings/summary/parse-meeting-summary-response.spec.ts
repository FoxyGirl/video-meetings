import { describe, it, expect } from '@jest/globals';
import { parseMeetingSummaryResponse } from './parse-meeting-summary-response';

describe('parseMeetingSummaryResponse', () => {
  it('parses a well-formed response, including an assignee when present', () => {
    const result = parseMeetingSummaryResponse(
      JSON.stringify({
        summary: 'The team reviewed the sprint plan.',
        actionItems: [
          { description: 'Draft the sprint plan doc', assignee: 'Alex' },
          { description: 'Follow up with design' },
        ],
        decisions: ['Adopt the two-week sprint cadence'],
      }),
    );

    expect(result).toEqual({
      summary: 'The team reviewed the sprint plan.',
      actionItems: [
        { description: 'Draft the sprint plan doc', assignee: 'Alex' },
        { description: 'Follow up with design' },
      ],
      decisions: ['Adopt the two-week sprint cadence'],
    });
  });

  it('parses a well-formed response with empty actionItems/decisions rather than fabricating content', () => {
    const result = parseMeetingSummaryResponse(
      JSON.stringify({
        summary: 'A short, uneventful check-in.',
        actionItems: [],
        decisions: [],
      }),
    );

    expect(result).toEqual({
      summary: 'A short, uneventful check-in.',
      actionItems: [],
      decisions: [],
    });
  });

  it('omits assignee from an action item rather than storing an empty string', () => {
    const result = parseMeetingSummaryResponse(
      JSON.stringify({
        summary: 'Summary.',
        actionItems: [{ description: 'Do the thing', assignee: '' }],
        decisions: [],
      }),
    );

    expect(result.actionItems).toEqual([{ description: 'Do the thing' }]);
  });

  it('throws a handled error, not a crash, for an empty response', () => {
    expect(() => parseMeetingSummaryResponse(undefined)).toThrow();
    expect(() => parseMeetingSummaryResponse('')).toThrow();
  });

  it('throws a handled error for unparseable (non-JSON) text', () => {
    expect(() =>
      parseMeetingSummaryResponse('this is not json at all'),
    ).toThrow();
  });

  it('throws a handled error when "summary" is missing or the wrong type', () => {
    expect(() =>
      parseMeetingSummaryResponse(
        JSON.stringify({ actionItems: [], decisions: [] }),
      ),
    ).toThrow();

    expect(() =>
      parseMeetingSummaryResponse(
        JSON.stringify({ summary: 42, actionItems: [], decisions: [] }),
      ),
    ).toThrow();
  });

  it('throws a handled error when "actionItems" is not an array', () => {
    expect(() =>
      parseMeetingSummaryResponse(
        JSON.stringify({
          summary: 'Summary.',
          actionItems: 'not an array',
          decisions: [],
        }),
      ),
    ).toThrow();
  });

  it('throws a handled error when an actionItems entry is missing a description', () => {
    expect(() =>
      parseMeetingSummaryResponse(
        JSON.stringify({
          summary: 'Summary.',
          actionItems: [{ assignee: 'Alex' }],
          decisions: [],
        }),
      ),
    ).toThrow();
  });

  it('throws a handled error when "decisions" is not an array of strings', () => {
    expect(() =>
      parseMeetingSummaryResponse(
        JSON.stringify({
          summary: 'Summary.',
          actionItems: [],
          decisions: [{ description: 'Not a plain string' }],
        }),
      ),
    ).toThrow();
  });
});
