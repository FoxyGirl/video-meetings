const STORAGE_KEY = 'video-meetings:auth';

export interface AuthState {
  accessToken: string;
  email: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: { value: AuthState | null } | null = null;

function readAuth(): AuthState | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as AuthState;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getAuthSnapshot(): AuthState | null {
  cache ??= { value: readAuth() };
  return cache.value;
}

export function getServerAuthSnapshot(): AuthState | null {
  return null;
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAuthState(next: AuthState | null): void {
  cache = { value: next };
  if (next) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  listeners.forEach((listener) => listener());
}
