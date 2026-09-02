'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../ui/user-provider';

// Shared by every authenticated page that needs the current user's profile
// (/profile, /profile/edit, ...): redirects to /login once the session
// resolves to signed-out. The profile itself lives in UserProvider (fetched
// once, app-wide, right after login/session-restore — see
// ui/user-provider.tsx) rather than being fetched per page; a 401 during
// that fetch clears the session, which is what drives the redirect below,
// same as an already-signed-out visitor. Callers render their own
// loading/error UI based on the returned state.
export function useProfile() {
  const router = useRouter();
  const { hasSession, isLoading, profile, setProfile, profileError } =
    useUser();

  useEffect(() => {
    if (!isLoading && !hasSession) {
      router.replace('/login');
    }
  }, [isLoading, hasSession, router]);

  return {
    profile,
    setProfile,
    profileError,
    isLoading: isLoading || !hasSession || !profile,
  };
}
