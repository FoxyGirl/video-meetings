import { GoogleGenAI, Type } from '@google/genai';
import {
  MeetingSummaryResult,
  parseMeetingSummaryResponse,
} from './parse-meeting-summary-response';
import { GEMINI_MODEL, getGeminiApiKey } from './summary.constants';

// Ask the model to conform to a schema rather than hand-parsing free text —
// responseSchema plus responseMimeType: 'application/json' below (the
// structured-output option this SDK exposes), matching
// docs/research-meeting-summary-action-items-and-decisions.md's recommended
// approach.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: 'A short prose overview of what the meeting covered.',
    },
    actionItems: {
      type: Type.ARRAY,
      description:
        'Concrete to-do items raised in the meeting. Empty if none were raised — never invent items unsupported by the transcript.',
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          assignee: {
            type: Type.STRING,
            description:
              'The name/identifier of the person responsible, exactly as mentioned in the transcript. Omit this field entirely if no one is identified as responsible.',
          },
        },
        required: ['description'],
      },
    },
    decisions: {
      type: Type.ARRAY,
      description:
        'Distinct conclusions/decisions reached in the meeting, separate from action items. Empty if none were reached — never invent decisions unsupported by the transcript.',
      items: { type: Type.STRING },
    },
  },
  required: ['summary', 'actionItems', 'decisions'],
};

const SYSTEM_INSTRUCTION = `You summarize meeting transcripts. Given a transcript, extract:
- summary: a short prose overview of what the meeting covered.
- actionItems: concrete to-do items raised in the meeting, each with a description and, only when the transcript names a responsible person, an assignee.
- decisions: distinct conclusions/decisions reached in the meeting, separate from action items.

Only report items and decisions actually supported by the transcript. If the transcript names no clear action items, return an empty actionItems array. If it names no clear decisions, return an empty decisions array. Never invent content that isn't in the transcript.`;

// Wraps the chosen LLM provider's SDK behind one function: given a meeting's
// combined transcript text, returns the parsed summary/action items/
// decisions, or throws on any API error or malformed response — the caller
// (GenerateMeetingSummaryHandler) treats any throw as a handled FAILED.
export async function generateMeetingSummary(
  transcriptText: string,
): Promise<MeetingSummaryResult> {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: transcriptText,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  return parseMeetingSummaryResponse(response.text);
}
