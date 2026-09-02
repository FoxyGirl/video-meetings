'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  getAuthSnapshot,
  getServerAuthSnapshot,
  getUserId,
  setAuthState,
  subscribeAuth,
  type AuthState,
} from '../model';

interface SessionContextValue {
  auth: AuthState | null;
  userId: string | null;
  isLoading: boolean;
  login: (auth: AuthState) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function subscribeMounted() {
  return () => {};
}

// Session-only half of the old auth-context.tsx's AuthProvider: the raw
// token/email state (from entities/session's own model.ts), decoded userId,
// hydration-loading flag, and login/logout actions. Deliberately knows
// nothing about the user's profile — that orchestration lives in
// entities/user's UserProvider instead, composed alongside this one in
// src/_app/providers.tsx rather than imported here, since a sibling entity
// slice can't import this one directly (see that file's own comment).
export function SessionProvider({ children }: { children: ReactNode }) {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getServerAuthSnapshot,
  );
  const isLoading = useSyncExternalStore(
    subscribeMounted,
    () => false,
    () => true,
  );

  const login = useCallback((next: AuthState) => setAuthState(next), []);
  const logout = useCallback(() => setAuthState(null), []);
  const userId = useMemo(
    () => (auth ? getUserId(auth.accessToken) : null),
    [auth],
  );

  return (
    <SessionContext.Provider value={{ auth, userId, isLoading, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
