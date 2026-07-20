'use client';

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  getAuthSnapshot,
  getServerAuthSnapshot,
  setAuthState,
  subscribeAuth,
  type AuthState,
} from './auth-store';

interface AuthContextValue {
  auth: AuthState | null;
  isLoading: boolean;
  login: (auth: AuthState) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function subscribeMounted() {
  return () => {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
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

  return (
    <AuthContext.Provider value={{ auth, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
