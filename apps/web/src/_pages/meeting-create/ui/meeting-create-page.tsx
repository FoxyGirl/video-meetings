'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@heroui/react';
import { useSession } from '@/entities/session';
import { CreateMeetingForm } from '@/features/create-meeting';

export default function MeetingCreatePage() {
  const router = useRouter();
  const { auth, isLoading, logout } = useSession();

  useEffect(() => {
    if (!isLoading && !auth) {
      router.replace('/login');
    }
  }, [isLoading, auth, router]);

  if (isLoading || !auth) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleSessionExpired = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-4 py-16 dark:from-zinc-950 dark:via-black dark:to-zinc-950">
      <CreateMeetingForm onSessionExpired={handleSessionExpired} />
    </div>
  );
}
