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
