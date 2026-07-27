import axios from 'axios';
import { http } from './http';
import { formatBytes, MAX_UPLOAD_FILE_SIZE_BYTES } from './file-types';

export { API_URL } from './http';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function extractServerMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('message' in data)) {
    return undefined;
  }
  const message = (data as { message?: unknown }).message;
  if (typeof message === 'string') {
    return message;
  }
  // class-validator DTO failures come back as a string[] (one entry per
  // failed rule) via Nest's default ValidationPipe, not a single string.
  if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
    return (message as string[]).join(' ');
  }
  return undefined;
}

// Axios rejects on non-2xx (unlike fetch, which only exposes res.ok), so
// every call site funnels its catch through here to normalize onto the
// existing ApiError shape. statusMessages lets a call site override the
// server's raw message with a friendlier one for specific statuses; when no
// override matches, the server's own message is used (e.g. upload
// validation errors, which are already specific per-case strings).
function toApiError(
  error: unknown,
  statusMessages: Record<number, string> = {},
): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const message =
      statusMessages[status] ??
      extractServerMessage(error.response?.data) ??
      'Something went wrong. Please try again.';
    return new ApiError(message, status);
  }
  return new ApiError('Something went wrong. Please try again.', 0);
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface AuthResult {
  accessToken: string;
}

export async function registerUser(
  payload: RegisterPayload,
): Promise<AuthResult> {
  try {
    const res = await http.post<AuthResult>('/auth/register', payload);
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      409: 'An account with this email already exists.',
    });
  }
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResult> {
  try {
    const res = await http.post<AuthResult>('/auth/login', payload);
    return res.data;
  } catch (error) {
    throw toApiError(error, { 401: 'Invalid email or password.' });
  }
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
  organizerId: string;
  createdAt: string;
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

export interface MeetingFileMetadata {
  fileOriginalName: string;
  fileMimeType: string;
  fileSize: number;
  fileUploadedAt: string;
}

// Resolves to null when the meeting has no stored file (404) rather than
// throwing — callers only need to distinguish "no file yet" from a real
// error, and by the time this is called the meeting's own existence has
// already been confirmed via getMeeting.
export async function getMeetingFile(
  id: string,
): Promise<MeetingFileMetadata | null> {
  try {
    const res = await http.get<MeetingFileMetadata>(`/meetings/${id}/file`);
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

// Downloads via a Bearer-authenticated GET rather than a plain <a href> —
// browsers don't attach custom headers to normal navigations, so the bytes
// are fetched as a blob and saved through a short-lived object URL instead.
export async function downloadMeetingFile(
  id: string,
  fileName: string,
): Promise<void> {
  try {
    const res = await http.get<Blob>(`/meetings/${id}/file/download`, {
      responseType: 'blob',
    });
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

export async function deleteMeetingFile(id: string): Promise<void> {
  try {
    await http.delete(`/meetings/${id}/file`);
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      404: 'This meeting no longer exists, has no recording, or you are not its organizer.',
    });
  }
}

export async function uploadMeetingFile(
  id: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MeetingFileMetadata> {
  const form = new FormData();
  // Field name must match the server's FileInterceptor('file', ...).
  form.append('file', file);

  try {
    const res = await http.post<MeetingFileMetadata>(
      `/meetings/${id}/file`,
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
      // Nest's default 413 body just says "File too large" — the actual
      // limit is more actionable than the server's generic message.
      413: `File is too large. Maximum size is ${formatBytes(MAX_UPLOAD_FILE_SIZE_BYTES)}.`,
    });
  }
}
