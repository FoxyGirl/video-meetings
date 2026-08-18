'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ApiError, getProfile, type UserProfile } from './api';
import {
  getAuthSnapshot,
  getServerAuthSnapshot,
  getUserId,
  setAuthState,
  subscribeAuth,
  type AuthState,
} from './auth-store';

interface AuthContextValue {
  auth: AuthState | null;
  userId: string | null;
  isLoading: boolean;
  profile: UserProfile | null;
  profileError: string | null;
  setProfile: (profile: UserProfile) => void;
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
  const userId = useMemo(
    () => (auth ? getUserId(auth.accessToken) : null),
    [auth],
  );

  // Both tagged with the id of the user they were produced for (profile also
  // via the public setProfile below) so a new session doesn't need a
  // synchronous reset of the previous one's leftover state — `profile` and
  // `profileError` just derive to null once `userId` no longer matches, same
  // "only valid while the key still matches" technique avatar.tsx's
  // useAvatarImageUrl already uses for its fetched object URL. Keyed on
  // `userId` rather than the raw access token: it's not a secret (unlike the
  // token, which this would otherwise be copying into React state — and
  // from there into DevTools/error boundaries/session-replay tooling), and
  // re-login as the *same* user (e.g. a token refresh) keeps the cached
  // profile instead of needlessly discarding it.
  const [fetchedProfile, setFetchedProfile] = useState<{
    userId: string;
    profile: UserProfile;
  } | null>(null);
  const [fetchedProfileError, setFetchedProfileError] = useState<{
    userId: string;
    message: string;
  } | null>(null);

  const setProfile = useCallback(
    (next: UserProfile) => {
      if (!userId) {
        return;
      }
      setFetchedProfile({ userId, profile: next });
    },
    [userId],
  );

  // Fetches the profile (username/avatar — not carried by the JWT payload,
  // see auth-store's getUserId) as soon as a session exists, so it's
  // available app-wide via context instead of every page that needs it
  // re-fetching its own copy. Keyed on `auth` alone: it re-fires right after
  // login, and again for a session restored from localStorage on a fresh
  // page load, but not on every render.
  useEffect(() => {
    if (!auth) {
      return;
    }

    let cancelled = false;

    getProfile()
      .then((data) => {
        // userId can be null if the token fails to decode — nothing sane to
        // key the cache on in that case, so just skip caching (the derived
        // `profile` below never matches a null key, so this never regresses
        // to serving stale data for a different, later-decodable session).
        if (!cancelled && userId) {
          setFetchedProfile({ userId, profile: data });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          // Session is no longer valid — clear it. Any page whose own
          // auth-gating effect is watching `auth` will redirect to /login.
          logout();
          return;
        }
        if (userId) {
          setFetchedProfileError({
            userId,
            message:
              error instanceof ApiError
                ? error.message
                : 'Failed to load profile. Please try again.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth, userId, logout]);

  // `userId &&` guards against a null userId (undecodable token) matching a
  // stale null-keyed entry — a null key must never be treated as valid.
  const profile =
    userId && fetchedProfile?.userId === userId ? fetchedProfile.profile : null;
  const profileError =
    userId && fetchedProfileError?.userId === userId
      ? fetchedProfileError.message
      : null;

  return (
    <AuthContext.Provider
      value={{
        auth,
        userId,
        isLoading,
        profile,
        profileError,
        setProfile,
        login,
        logout,
      }}
    >
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
