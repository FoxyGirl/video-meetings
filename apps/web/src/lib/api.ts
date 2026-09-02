import axios from 'axios';
import { API_URL, http, ApiError, toApiError } from '@/shared/api';
// Re-exported solely so the now-fully-unreferenced lib/auth-context.tsx
// still compiles until issue #221 deletes it — nothing else imports these
// from here anymore (update-username/upload-avatar/change-password each
// import UserProfile from @/entities/user directly).
import { type UserProfile, getProfile } from '@/entities/user';

export { API_URL, ApiError };
export { type UserProfile, getProfile };

// Fetches the current user's avatar image via a Bearer-authenticated GET,
// same reasoning as downloadMeetingFile: the browser won't attach custom
// headers to a plain <img src>, so the bytes come back as a Blob and the
// caller renders it via an object URL instead. Resolves null on a 404
// ("no avatar yet") rather than throwing — callers should fall back to the
// initials placeholder.
export async function getAvatarBlob(): Promise<Blob | null> {
  try {
    const res = await http.get<Blob>('/users/me/avatar', {
      responseType: 'blob',
    });
    return res.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
    });
  }
}

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

// Mirrors the api's Prisma TranscriptionStatus enum.
export type TranscriptionStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface MeetingFileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  // Independently nullable from the fields above — a file can exist with
  // no transcription state yet (e.g. transcription disabled, or the row
  // predates the transcription migration).
  transcriptionStatus: TranscriptionStatus | null;
  transcriptionText: string | null;
}

// A meeting can have several files transcribing at once, each with its own
// MeetingTranscription instance polling this on the same 3s cadence — since
// they're all mounted together from the same files.map in page.tsx, their
// ticks land in the same window far more often than not. Coalescing
// concurrent calls for the same meeting id into one shared in-flight
// request/response avoids sending N identical requests per tick for what's
// always the same full-list payload.
const inFlightListMeetingFiles = new Map<
  string,
  Promise<MeetingFileMetadata[]>
>();

// Lists every file stored on the meeting, ordered by upload time — open to
// any authenticated user, same access rule the old single-file metadata
// endpoint used.
export async function listMeetingFiles(
  id: string,
): Promise<MeetingFileMetadata[]> {
  const inFlight = inFlightListMeetingFiles.get(id);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const res = await http.get<MeetingFileMetadata[]>(
        `/meetings/${id}/files`,
      );
      return res.data;
    } catch (error) {
      throw toApiError(error, {
        401: 'Your session has expired. Please sign in again.',
      });
    } finally {
      inFlightListMeetingFiles.delete(id);
    }
  })();
  inFlightListMeetingFiles.set(id, request);
  return request;
}

// Downloads via a Bearer-authenticated GET rather than a plain <a href> —
// browsers don't attach custom headers to normal navigations, so the bytes
// are fetched as a blob and saved through a short-lived object URL instead.
export async function downloadMeetingFile(
  meetingId: string,
  fileId: string,
  fileName: string,
): Promise<void> {
  try {
    const res = await http.get<Blob>(
      `/meetings/${meetingId}/files/${fileId}/download`,
      { responseType: 'blob' },
    );
    const url = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      404: 'This meeting no longer has a stored recording.',
    });
  }
}

export async function deleteMeetingFile(
  meetingId: string,
  fileId: string,
): Promise<void> {
  try {
    await http.delete(`/meetings/${meetingId}/files/${fileId}`);
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      404: 'This meeting no longer exists, has no recording, or you are not its organizer.',
    });
  }
}

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

export interface UploadBatchResult {
  accepted: MeetingFileMetadata[];
  rejected: { originalName: string; reason: string }[];
}

// Sends every file in one multipart request (field name `files`, repeated —
// matches the server's FilesInterceptor('files', MAX_FILES_PER_MEETING,
// ...)) and returns the full per-file outcome rather than unwrapping to a
// single file: a batch response is always a 2xx with accepted/rejected
// arrays, even when every file was rejected (e.g. the 10-file cap), so
// there's no single "the request failed" case to throw for here — that's
// left to the caller to render per file.
export async function uploadMeetingFiles(
  id: string,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadBatchResult> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }

  try {
    const res = await http.post<UploadBatchResult>(
      `/meetings/${id}/files`,
      form,
      {
        onUploadProgress: (event) => {
          // event.total can be undefined if content length can't be
          // computed — same guard raw XHR's lengthComputable would need.
          if (event.total) {
            onProgress?.(Math.round((event.loaded / event.total) * 100));
          }
        },
      },
    );
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      404: 'This meeting no longer exists or you are not its organizer.',
      // Deliberately not size-specific: file-types.ts's client-side max is
      // only a mirrored guess at the server's real (env-configurable)
      // limit, and client-side validation already rejects anything over
      // that guess before a request is sent — so this path only fires when
      // the server's actual limit is *lower* than the client's, which is
      // exactly the case where citing the client's number would state a
      // wrong one.
      413: 'File is too large. Please try a smaller file.',
    });
  }
}
