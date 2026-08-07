'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, getProfile, type UserProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

// Shared by every authenticated page that needs the current user's profile
// (/profile, /profile/edit, ...): redirects to /login once auth resolves to
// signed-out, fetches the profile, and on a 401 during that fetch signs out
// and redirects the same way. Callers render their own loading/error UI
// based on the returned state.
export function useProfile() {
  const router = useRouter();
  const { auth, isLoading: isAuthLoading, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthLoading && !auth) {
      router.replace('/login');
    }
  }, [isAuthLoading, auth, router]);

  useEffect(() => {
    if (!auth) {
      return;
    }

    let cancelled = false;

    getProfile()
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          logout();
          router.replace('/login');
          return;
        }
        setProfileError(
          error instanceof ApiError
            ? error.message
            : 'Failed to load profile. Please try again.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [auth, logout, router]);

  return {
    auth,
    profile,
    setProfile,
    profileError,
    isLoading: isAuthLoading || !auth || !profile,
  };
}
