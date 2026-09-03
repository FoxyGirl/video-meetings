import { http, toApiError } from '@/shared/api';
import type { Meeting } from '@/entities/meeting';

// Abandons an in-progress summary run (PENDING/PROCESSING) and discards its
// eventual result — a no-op if the meeting's summary isn't actually
// in-flight. The response is a full, freshly-read Meeting (same
// GetMeetingHandler shape refreshMeetingSummary's response is), so the
// caller reads the real resulting summaryStatus (null, once stopped) off it
// rather than assume one.
export async function stopMeetingSummary(meetingId: string): Promise<Meeting> {
  try {
    const res = await http.post<Meeting>(`/meetings/${meetingId}/summary/stop`);
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      404: 'This meeting no longer exists or you are not its organizer.',
    });
  }
}
