import axios from 'axios';
import { http, toApiError } from '@/shared/api';

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  avatarMimeType: string | null;
  avatarUploadedAt: string | null;
}

export async function getProfile(): Promise<UserProfile> {
  try {
    const res = await http.get<UserProfile>('/users/me');
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
    });
  }
}

// Fetches the current user's avatar image via a Bearer-authenticated GET,
// same reasoning as entities/meeting-file's downloadMeetingFile: the
// browser won't attach custom headers to a plain <img src>, so the bytes
// come back as a Blob and the caller renders it via an object URL instead.
// Resolves null on a 404 ("no avatar yet") rather than throwing — callers
// should fall back to the initials placeholder.
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
