'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from '@/shared/api';
import { getProfile, type UserProfile } from '../api';

interface UserProviderProps {
  // Session data, passed in rather than read via entities/session directly:
  // entities/user and entities/session are sibling slices on the same
  // (entities) layer, and the PRD's own rule for a genuine same-layer
  // dependency is to lift composition to a higher layer instead of a direct
  // cross-slice import — src/_app/providers.tsx is what actually calls
  // entities/session's useSession() and feeds its output in here as props.
  hasSession: boolean;
  userId: string | null;
  // The session's own email, used only as CurrentUserAvatar's initials
  // fallback for the brief window (or outright failure) where the fetched
  // profile isn't available yet — not read by this provider's own fetch
  // effect below, which keys everything off userId instead.
  email: string | null;
  isLoading: boolean;
  logout: () => void;
  children: ReactNode;
}

interface UserContextValue {
  hasSession: boolean;
  email: string | null;
  isLoading: boolean;
  profile: UserProfile | null;
  profileError: string | null;
  setProfile: (profile: UserProfile) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

// Profile-fetch orchestration half of the old auth-context.tsx's
// AuthProvider — see entities/session's SessionProvider for the session-only
// half this was split from.
export function UserProvider({
  hasSession,
  userId,
  email,
  isLoading,
  logout,
  children,
}: UserProviderProps) {
  // Both tagged with the id of the user they were produced for (profile also
  // via the public setProfile below) so a new session doesn't need a
  // synchronous reset of the previous one's leftover state — `profile` and
  // `profileError` just derive to null once `userId` no longer matches, same
  // "only valid while the key still matches" technique entities/user's own
  // avatar.tsx uses for its fetched object URL. Keyed on `userId` rather
  // than the raw access token: it's not a secret (unlike the token, which
  // this would otherwise be copying into React state — and from there into
  // DevTools/error boundaries/session-replay tooling), and re-login as the
  // *same* user (e.g. a token refresh) keeps the cached profile instead of
  // needlessly discarding it.
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
  // see entities/session's getUserId) as soon as a session exists, so it's
  // available app-wide via context instead of every page that needs it
  // re-fetching its own copy. Keyed on `hasSession` alone: it re-fires right
  // after login, and again for a session restored from localStorage on a
  // fresh page load, but not on every render.
  useEffect(() => {
    if (!hasSession) {
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
          // auth-gating effect is watching the session will redirect to
          // /login.
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
  }, [hasSession, userId, logout]);

  // `userId &&` guards against a null userId (undecodable token) matching a
  // stale null-keyed entry — a null key must never be treated as valid.
  const profile =
    userId && fetchedProfile?.userId === userId ? fetchedProfile.profile : null;
  const profileError =
    userId && fetchedProfileError?.userId === userId
      ? fetchedProfileError.message
      : null;

  return (
    <UserContext.Provider
      value={{
        hasSession,
        email,
        isLoading,
        profile,
        profileError,
        setProfile,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
