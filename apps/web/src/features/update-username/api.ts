import { http, toApiError } from '@/shared/api';
import type { UserProfile } from '@/entities/user';

export async function updateUsername(
  username: string | null,
): Promise<UserProfile> {
  try {
    const res = await http.patch<UserProfile>('/users/me/username', {
      username,
    });
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
    });
  }
}
