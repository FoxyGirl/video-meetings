'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
  toast,
} from '@heroui/react';
import { UserAvatar } from '@/components/avatar';
import { ApiError, updateUsername } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useProfile } from '@/lib/use-profile';

// Hand-mirrored from apps/api/src/user/dto/update-username.dto.ts's @MaxLength(50) — keep in sync.
const MAX_USERNAME_LENGTH = 50;

export default function ProfileEditPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { profile, setProfile, profileError, isLoading } = useProfile();
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [username, setUsername] = useState('');
  const [hasSeededUsername, setHasSeededUsername] = useState(false);

  if (profile && !hasSeededUsername) {
    setHasSeededUsername(true);
    setUsername(profile.username ?? '');
  }

  const onSubmitUsername = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setUsernameError(null);
    setIsSavingUsername(true);
    try {
      const updated = await updateUsername(username.trim() || null);
      setProfile(updated);
      setUsername(updated.username ?? '');
      toast.success('Username updated');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        router.replace('/login');
        return;
      }
      setUsernameError(
        error instanceof ApiError
          ? error.message
          : 'Failed to update username. Please try again.',
      );
    } finally {
      setIsSavingUsername(false);
    }
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
          <UserAvatar
            email={profile.email}
            username={profile.username}
            size="lg"
          />
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

      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>Username</Card.Title>
          <Card.Description>
            Shown instead of your email wherever your name appears.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Form className="flex flex-col gap-4" onSubmit={onSubmitUsername}>
            <TextField
              name="username"
              value={username}
              onChange={setUsername}
              validate={(value) =>
                value.length > MAX_USERNAME_LENGTH
                  ? `Username must be ${MAX_USERNAME_LENGTH} characters or fewer.`
                  : null
              }
            >
              <Label>Username</Label>
              <Input placeholder="Your name" variant="secondary" />
              <FieldError />
            </TextField>

            {usernameError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{usernameError}</Alert.Title>
                </Alert.Content>
              </Alert>
            ) : null}

            <Button isPending={isSavingUsername} type="submit">
              {isSavingUsername ? <Spinner color="current" size="sm" /> : null}
              {isSavingUsername ? 'Saving…' : 'Save'}
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
}
