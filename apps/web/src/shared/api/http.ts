import axios from 'axios';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const http = axios.create({ baseURL: API_URL });

// `shared` may only import from itself — it can't read entities/session's
// token store directly without an upward import. The entity registers
// itself here instead (from its own module scope, so it happens once before
// any component can render and issue a request); shared just holds the
// slot and calls whatever was last registered.
let authTokenProvider: (() => string | null) | null = null;

export function setAuthTokenProvider(provider: () => string | null): void {
  authTokenProvider = provider;
}

http.interceptors.request.use((config) => {
  const token = authTokenProvider?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
