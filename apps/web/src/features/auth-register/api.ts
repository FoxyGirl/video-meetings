import { http, toApiError } from '@/shared/api';

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
