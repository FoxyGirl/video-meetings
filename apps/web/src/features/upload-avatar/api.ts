import { http, toApiError } from '@/shared/api';
import type { UserProfile } from '@/entities/user';

export async function uploadAvatar(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UserProfile> {
  const form = new FormData();
  // Field name must match the server's FileInterceptor('file', ...).
  form.append('file', file);

  try {
    const res = await http.post<UserProfile>('/users/me/avatar', form, {
      onUploadProgress: (event) => {
        // event.total can be undefined if content length can't be
        // computed — same guard raw XHR's lengthComputable would need.
        if (event.total) {
          onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
      },
    });
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
      // Deliberately not size-specific: avatar-file-types.ts's client-side
      // max is only a mirrored guess at the server's real (env-configurable)
      // limit, and client-side validation already rejects anything over
      // that guess before a request is sent — so this path only fires when
      // the server's actual limit is *lower* than the client's, which is
      // exactly the case where citing the client's number would state a
      // wrong one.
      413: 'File is too large. Please try a smaller image.',
    });
  }
}
