import { http, toApiError } from '@/shared/api';
import type { AuthResult } from '@/entities/session';

export type { AuthResult };

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
