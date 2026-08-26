export interface MeetingSummaryActionItem {
  description: string;
  assignee?: string;
}

export interface MeetingSummaryResult {
  summary: string;
  actionItems: MeetingSummaryActionItem[];
  decisions: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseActionItems(value: unknown): MeetingSummaryActionItem[] {
  if (!Array.isArray(value)) {
    throw new Error('Summary model response: "actionItems" is not an array.');
  }

  return value.map((item) => {
    if (!isRecord(item) || typeof item.description !== 'string') {
      throw new Error(
        'Summary model response: an actionItems entry is malformed.',
      );
    }

    const actionItem: MeetingSummaryActionItem = {
      description: item.description,
    };

    if (typeof item.assignee === 'string' && item.assignee.length > 0) {
      actionItem.assignee = item.assignee;
    }

    return actionItem;
  });
}

function parseDecisions(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(
      'Summary model response: "decisions" is not an array of strings.',
    );
  }

  return value as string[];
}

// Parses/validates the raw JSON text the model returns into a
// MeetingSummaryResult, throwing on anything malformed/unparseable rather
// than storing partial/garbage data. GenerateMeetingSummaryHandler treats any
// throw here as a handled FAILED, per the PRD's "LLM output is not
// guaranteed structured/parseable" technical limitation — even with
// responseSchema requested, the API can still return empty/truncated text
// (e.g. a safety block or a length cutoff).
export function parseMeetingSummaryResponse(
  responseText: string | undefined,
): MeetingSummaryResult {
  if (!responseText) {
    throw new Error('Summary model returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error('Summary model response was not valid JSON.');
  }

  if (!isRecord(parsed) || typeof parsed.summary !== 'string') {
    throw new Error('Summary model response is missing a "summary" string.');
  }

  return {
    summary: parsed.summary,
    actionItems: parseActionItems(parsed.actionItems),
    decisions: parseDecisions(parsed.decisions),
  };
}
