'use client';

import { useRouter } from 'next/navigation';
import { Alert, Card, Spinner } from '@heroui/react';
import { useSession } from '@/entities/session';
import { CurrentUserAvatar, useProfile } from '@/entities/user';
import { AvatarUpload } from '@/features/upload-avatar';
import { UpdateUsernameForm } from '@/features/update-username';
import { ChangePasswordForm } from '@/features/change-password';

export default function ProfileEditPage() {
  const router = useRouter();
  const { logout } = useSession();
  const { profile, setProfile, profileError, isLoading } = useProfile();

  const handleSessionExpired = () => {
    logout();
    router.replace('/login');
  };

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
        <Spinner data-testid="profile-edit-loading" size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-4 py-16 dark:from-zinc-950 dark:via-black dark:to-zinc-950">
      <Card className="w-full max-w-md">
        <Card.Content className="flex flex-col items-center gap-4 py-10">
          <CurrentUserAvatar size="lg" />
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-lg font-semibold text-foreground">
              Edit profile
            </h1>
            {!!profile.username && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {profile.username}
              </p>
            )}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {profile.email}
            </p>
          </div>
        </Card.Content>
      </Card>

      <div className="w-full max-w-md">
        <AvatarUpload
          onSessionExpired={handleSessionExpired}
          onUploaded={setProfile}
        />
      </div>

      <UpdateUsernameForm
        profile={profile}
        onUpdated={setProfile}
        onSessionExpired={handleSessionExpired}
      />

      <ChangePasswordForm
        profile={profile}
        onSessionExpired={handleSessionExpired}
      />
    </div>
  );
}
