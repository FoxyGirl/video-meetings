'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

// Shared by every authenticated page that needs the current user's profile
// (/profile, /profile/edit, ...): redirects to /login once auth resolves to
// signed-out. The profile itself now lives in auth-context (fetched once,
// app-wide, right after login/session-restore — see auth-context.tsx) rather
// than being fetched per page; a 401 during that fetch clears the session,
// which is what drives the redirect below, same as an already-signed-out
// visitor. Callers render their own loading/error UI based on the returned
// state.
export function useProfile() {
  const router = useRouter();
  const {
    auth,
    isLoading: isAuthLoading,
    profile,
    setProfile,
    profileError,
  } = useAuth();

  useEffect(() => {
    if (!isAuthLoading && !auth) {
      router.replace('/login');
    }
  }, [isAuthLoading, auth, router]);

  return {
    profile,
    setProfile,
    profileError,
    isLoading: isAuthLoading || !auth || !profile,
  };
}
