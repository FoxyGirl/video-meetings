'use client';

import { ThemeProvider } from 'next-themes';
import { SessionProvider, useSession } from '@/entities/session';
import { UserProvider } from '@/entities/user';

// entities/user's UserProvider needs session data (whether a session
// exists, its userId/email, logout) but can't import entities/session
// directly — same-layer entity slices don't import each other (see
// UserProvider's own comment). This bridge is the composition the PRD calls
// for instead: it's the one place that reads entities/session's
// useSession() and hands the result into entities/user as props.
function UserSessionBridge({ children }: { children: React.ReactNode }) {
  const { auth, userId, isLoading, logout } = useSession();

  return (
    <UserProvider
      hasSession={!!auth}
      userId={userId}
      email={auth?.email ?? null}
      isLoading={isLoading}
      logout={logout}
    >
      {children}
    </UserProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system">
      <SessionProvider>
        <UserSessionBridge>{children}</UserSessionBridge>
      </SessionProvider>
    </ThemeProvider>
  );
}
