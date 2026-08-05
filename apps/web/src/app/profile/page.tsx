'use client';

import { useEffect, useState } from 'react';
import { Card, Spinner } from '@heroui/react';
import { UserAvatar } from '@/components/avatar';
import { getProfile, type UserProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function ProfilePage() {
  const { auth, isLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

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
        if (!cancelled) {
          console.error('Failed to load profile', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth]);

  if (isLoading || !auth || !profile) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner data-testid="profile-loading" size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-4 py-16 dark:from-zinc-950 dark:via-black dark:to-zinc-950">
      <Card className="w-full max-w-md">
        <Card.Content className="flex flex-col items-center gap-4 py-10">
          <UserAvatar
            email={profile.email}
            username={profile.username}
            size="lg"
          />
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-lg font-semibold text-foreground">
              {profile.username ?? profile.email}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {profile.email}
            </p>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
