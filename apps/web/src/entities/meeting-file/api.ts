import { http, toApiError } from '@/shared/api';
import { validateFileAgainstTypes } from '@/shared/lib';

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

// Extension -> declared MIME type. Mirrored from
// apps/api/src/meetings/upload/file-upload.constants.ts — keep both tables
// identical if either changes; the two apps don't share code.
export const ACCEPTED_FILE_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

// Mirrors the server's default (apps/api's MAX_UPLOAD_FILE_SIZE_BYTES) —
// this client-side copy is a fixed UX fast-fail, not the authority; the
// server remains the real limit even if MAX_UPLOAD_FILE_SIZE_BYTES is
// overridden per environment there.
export const MAX_UPLOAD_FILE_SIZE_BYTES = 500 * 1024 * 1024;

// Mirrors the server's MAX_FILES_PER_MEETING (apps/api's
// file-upload.constants.ts) — fixed, not env-configurable on either side.
export const MAX_FILES_PER_MEETING = 10;

export function validateFile(file: File): string | null {
  return validateFileAgainstTypes(
    file,
    ACCEPTED_FILE_TYPES,
    MAX_UPLOAD_FILE_SIZE_BYTES,
  );
}

// Adaptive-unit formatter for displaying an arbitrary stored file's actual
// size (e.g. a small test recording) — unlike shared/lib's formatBytes,
// which only ever formats large, MB-scale thresholds (max size, "too large"
// messages) and would misleadingly show "0 MB" for anything under 500 KB.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

// A meeting can have several files transcribing at once, each with its own
// polling instance calling this on the same 3s cadence — since they're all
// mounted together from the same widget, their ticks land in the same
// window far more often than not. Coalescing concurrent calls for the same
// meeting id into one shared in-flight request/response avoids sending N
// identical requests per tick for what's always the same full-list payload.
const inFlightListMeetingFiles = new Map<
  string,
  Promise<MeetingFileMetadata[]>
>();

// Lists every file stored on the meeting, ordered by upload time — open to
// any authenticated user, same access rule the file lifecycle has always
// used; an empty array (not a 404) means the meeting has no files yet.
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
