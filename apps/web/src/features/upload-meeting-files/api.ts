import { http, toApiError } from '@/shared/api';
import type { MeetingFileMetadata } from '@/entities/meeting-file';

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
      // Deliberately not size-specific: entities/meeting-file's client-side
      // max is only a mirrored guess at the server's real (env-configurable)
      // limit, and client-side validation already rejects anything over
      // that guess before a request is sent — so this path only fires when
      // the server's actual limit is *lower* than the client's, which is
      // exactly the case where citing the client's number would state a
      // wrong one.
      413: 'File is too large. Please try a smaller file.',
    });
  }
}
