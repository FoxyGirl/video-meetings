import { http, toApiError } from '@/shared/api';

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResult {
  accessToken: string;
}

// A wrong current password is a 403 here (ChangePasswordHandler), not a 401
// — see apps/api/src/user/commands/handlers/change-password.handler.ts. That
// keeps this call's 401 meaning exactly what it means everywhere else in
// this app (JwtAuthGuard rejecting a missing/expired token), so this can use
// the same blanket "session expired" override as every other call site
// instead of string-matching the response body to tell the two apart.
export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<AuthResult> {
  try {
    const res = await http.patch<AuthResult>('/users/me/password', payload);
    return res.data;
  } catch (error) {
    throw toApiError(error, {
      401: 'Your session has expired. Please sign in again.',
    });
  }
}
