import { http, toApiError } from '@/shared/api';
import type { TranscriptionStatus } from '@/entities/meeting-file';

export interface RefreshTranscriptionResult {
  transcriptionStatus: TranscriptionStatus | null;
  transcriptionText: string | null;
}

// The response body is the authority on the resulting status, not an
// assumed PENDING: RefreshTranscriptionHandler's own compare-and-set can
// no-op (e.g. a concurrent delete/replace already moved the meeting off
// the file this refresh was scoped to), in which case it re-reads and
// returns whatever the true current state actually is instead of a
// fabricated PENDING — the caller needs that same value, not a guess, to
// avoid getting stuck showing "PENDING" for a run that was never actually
// dispatched. The response is the file's own metadata now (file-scoped
// route), not a whole Meeting row; only the two transcription fields are
// picked out here, mirroring MeetingFileMetadata's shape.
export async function refreshTranscription(
  meetingId: string,
  fileId: string,
): Promise<RefreshTranscriptionResult> {
  try {
    const res = await http.post<RefreshTranscriptionResult>(
      `/meetings/${meetingId}/files/${fileId}/transcription/refresh`,
    );
    return {
      transcriptionStatus: res.data.transcriptionStatus,
      transcriptionText: res.data.transcriptionText,
    };
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      404: 'This meeting no longer exists, has no recording, or you are not its organizer.',
    });
  }
}
