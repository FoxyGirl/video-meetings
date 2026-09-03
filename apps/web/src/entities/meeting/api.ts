import { http, toApiError } from '@/shared/api';

// Mirrors the api's Prisma SummaryStatus enum — a distinct type from
// TranscriptionStatus even though the four values are identical, since the
// two are independent state machines (a meeting's summary vs. one file's
// transcription).
export type SummaryStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ActionItemMetadata {
  id: string;
  description: string;
  assignee: string | null;
}

export interface DecisionMetadata {
  id: string;
  description: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
  organizerId: string;
  createdAt: string;
  // null means "not yet applicable" — no generation has ever been
  // triggered for this meeting (files still transcribing, or none
  // completed). See MeetingSummary (components/meeting-summary.tsx) for how
  // that's distinguished from an in-progress/failed/completed run.
  summaryStatus: SummaryStatus | null;
  summaryText: string | null;
  summaryIsPartial: boolean | null;
  actionItems: ActionItemMetadata[];
  decisions: DecisionMetadata[];
}

export interface CreateMeetingPayload {
  title: string;
  date: string;
  participants: string[];
}

export async function createMeeting(
  payload: CreateMeetingPayload,
): Promise<Meeting> {
  try {
    const res = await http.post<Meeting>('/meetings', payload);
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
    });
  }
}

export async function getMeetings(): Promise<Meeting[]> {
  try {
    const res = await http.get<Meeting[]>('/meetings');
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
    });
  }
}

export async function getMeeting(id: string): Promise<Meeting> {
  try {
    const res = await http.get<Meeting>(`/meetings/${id}`);
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      404: 'This meeting doesn’t exist or has been deleted.',
      401: 'Your session has expired. Please sign in again.',
    });
  }
}

export async function deleteMeeting(id: string): Promise<void> {
  try {
    await http.delete(`/meetings/${id}`);
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      404: 'This meeting no longer exists or you are not its organizer.',
    });
  }
}
