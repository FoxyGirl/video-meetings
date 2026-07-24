export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const message =
      res.status === 409
        ? 'An account with this email already exists.'
        : 'Something went wrong. Please try again.';
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<AuthResult>;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function loginUser(payload: LoginPayload): Promise<AuthResult> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const message =
      res.status === 401
        ? 'Invalid email or password.'
        : 'Something went wrong. Please try again.';
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<AuthResult>;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
  organizerId: string;
  createdAt: string;
}

export async function getMeetings(accessToken: string): Promise<Meeting[]> {
  const res = await fetch(`${API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const message =
      res.status === 401
        ? 'Your session has expired. Please sign in again.'
        : 'Something went wrong. Please try again.';
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<Meeting[]>;
}
