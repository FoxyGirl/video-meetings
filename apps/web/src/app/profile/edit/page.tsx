'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, Spinner } from '@heroui/react';
import { UserAvatar } from '@/components/avatar';
import { ApiError, getProfile, type UserProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function ProfileEditPage() {
  const router = useRouter();
  const { auth, isLoading, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !auth) {
      router.replace('/login');
    }
  }, [isLoading, auth, router]);

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

  if (profileError) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Alert status="danger" className="w-full max-w-md">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{profileError}</Alert.Title>
          </Alert.Content>
        </Alert>
      </div>
    );
  }

  if (isLoading || !auth || !profile) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner data-testid="profile-edit-loading" size="lg" />
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
            <h1 className="text-lg font-semibold text-foreground">
              Edit profile
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
