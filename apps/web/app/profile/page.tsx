'use client';

import Link from 'next/link';
import { Alert, Card, Spinner } from '@heroui/react';
import { CurrentUserAvatar, useProfile } from '@/entities/user';

export default function ProfilePage() {
  const { profile, profileError, isLoading } = useProfile();

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

  if (isLoading || !profile) {
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
          <CurrentUserAvatar size="lg" />
          <div className="flex flex-col items-center gap-1 text-center">
            {profile.username && (
              <p className="text-lg font-semibold text-foreground">
                {profile.username}
              </p>
            )}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {profile.email}
            </p>
          </div>
          <Link
            className="text-sm font-medium text-foreground underline underline-offset-2"
            href="/profile/edit"
          >
            Edit profile
          </Link>
        </Card.Content>
      </Card>
    </div>
  );
}
