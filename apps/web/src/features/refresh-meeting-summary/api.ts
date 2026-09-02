import { http, toApiError } from '@/shared/api';
import type { Meeting } from '@/entities/meeting';

// Discards the meeting's current summary/action items/decisions and
// re-checks whether generation should run again, same
// RefreshMeetingSummaryHandler behavior refreshTranscription's own doc
// comment describes for its file-scoped equivalent. The response is a full,
// freshly-read Meeting (GetMeetingHandler's own response shape, not a
// locally-constructed one) — whether generation actually restarted depends
// on the meeting's current file states, so the caller has to read the real
// resulting summaryStatus off this response rather than assume PENDING.
export async function refreshMeetingSummary(
  meetingId: string,
): Promise<Meeting> {
  try {
    const res = await http.post<Meeting>(
      `/meetings/${meetingId}/summary/refresh`,
    );
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      404: 'This meeting no longer exists or you are not its organizer.',
    });
  }
}
