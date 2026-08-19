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
import { CurrentUserAvatar } from '@/components/avatar';
import { AvatarUpload } from '@/components/avatar-upload';
import { PasswordVisibilityToggle } from '@/components/password-visibility-toggle';
import { ApiError, changePassword, updateUsername } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useProfile } from '@/lib/use-profile';

// Hand-mirrored from apps/api/src/user/dto/update-username.dto.ts's @MaxLength(50) — keep in sync.
const MAX_USERNAME_LENGTH = 50;
// Hand-mirrored from apps/api/src/user/dto/change-password.dto.ts's @MinLength(8) on newPassword — keep in sync.
const MIN_NEW_PASSWORD_LENGTH = 8;
// changePassword() deliberately skips the usual blanket 401 -> "session expired"
// override (see its comment in lib/api.ts), since a 401 here can mean either an
// expired session (JwtAuthGuard) or a wrong current password
// (ChangePasswordHandler, hand-mirrored message below) — keep in sync with
// apps/api/src/user/commands/handlers/change-password.handler.ts.
const WRONG_CURRENT_PASSWORD_MESSAGE = 'Invalid credentials';
// Hand-mirrored from ChangePasswordHandler's exact string — keep in sync with
// apps/api/src/user/commands/handlers/change-password.handler.ts.
const SAME_AS_CURRENT_PASSWORD_MESSAGE =
  'New password must differ from current password';

export default function ProfileEditPage() {
  const router = useRouter();
  const { login, logout } = useAuth();
  const { profile, setProfile, profileError, isLoading } = useProfile();
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [username, setUsername] = useState('');
  const [hasSeededUsername, setHasSeededUsername] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isCurrentPasswordVisible, setIsCurrentPasswordVisible] =
    useState(false);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<
    Record<string, string>
  >({});
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  if (profile && !hasSeededUsername) {
    setHasSeededUsername(true);
    setUsername(profile.username ?? '');
  }

  const handleSessionExpired = () => {
    logout();
    router.replace('/login');
  };

  const onSubmitUsername = async (e: React.SyntheticEvent<HTMLFormElement>) => {
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
        handleSessionExpired();
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

  const onSubmitPassword = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profile) {
      return;
    }

    setPasswordError(null);
    setPasswordFieldErrors({});
    setIsSavingPassword(true);
    try {
      const { accessToken } = await changePassword({
        currentPassword,
        newPassword,
      });
      // ChangePasswordHandler reissues a fresh JWT — adopt it so the
      // session stays valid under whatever token the server now expects.
      login({ accessToken, email: profile.email });
      setCurrentPassword('');
      setNewPassword('');
      toast.success('Password updated');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (error.message === WRONG_CURRENT_PASSWORD_MESSAGE) {
          // Attached to the Current password field itself, not the shared
          // failure Alert — it's a problem with that one field, and this
          // keeps it visually distinct from a "new password too short"
          // failure (already field-scoped via the field's own `validate`)
          // or a generic form-wide failure.
          setPasswordFieldErrors({
            currentPassword: 'Incorrect current password.',
          });
          return;
        }
        handleSessionExpired();
        return;
      }
      if (
        error instanceof ApiError &&
        error.status === 400 &&
        error.message === SAME_AS_CURRENT_PASSWORD_MESSAGE
      ) {
        setPasswordFieldErrors({
          newPassword:
            'New password must be different from your current password.',
        });
        return;
      }
      setPasswordError(
        error instanceof ApiError
          ? error.message
          : 'Failed to change password. Please try again.',
      );
    } finally {
      setIsSavingPassword(false);
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

      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>Password</Card.Title>
          <Card.Description>
            Change the password you use to sign in.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Form
            className="flex flex-col gap-4"
            onSubmit={onSubmitPassword}
            validationErrors={passwordFieldErrors}
          >
            <TextField
              isRequired
              name="currentPassword"
              type={isCurrentPasswordVisible ? 'text' : 'password'}
              value={currentPassword}
              onChange={setCurrentPassword}
              validate={(value) =>
                value.length === 0 ? 'Enter your current password.' : null
              }
            >
              <Label>Current password</Label>
              <div className="relative">
                <Input
                  autoComplete="current-password"
                  className="pr-10"
                  fullWidth
                  placeholder="••••••••"
                  variant="secondary"
                />
                <PasswordVisibilityToggle
                  isVisible={isCurrentPasswordVisible}
                  onToggle={() =>
                    setIsCurrentPasswordVisible((visible) => !visible)
                  }
                />
              </div>
              <FieldError />
            </TextField>

            <TextField
              isRequired
              name="newPassword"
              type={isNewPasswordVisible ? 'text' : 'password'}
              value={newPassword}
              onChange={setNewPassword}
              validate={(value) =>
                value.length < MIN_NEW_PASSWORD_LENGTH
                  ? `New password must be at least ${MIN_NEW_PASSWORD_LENGTH} characters.`
                  : null
              }
            >
              <Label>New password</Label>
              <div className="relative">
                <Input
                  autoComplete="new-password"
                  className="pr-10"
                  fullWidth
                  placeholder="••••••••"
                  variant="secondary"
                />
                <PasswordVisibilityToggle
                  isVisible={isNewPasswordVisible}
                  onToggle={() =>
                    setIsNewPasswordVisible((visible) => !visible)
                  }
                />
              </div>
              <FieldError />
            </TextField>

            {passwordError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{passwordError}</Alert.Title>
                </Alert.Content>
              </Alert>
            ) : null}

            <Button isPending={isSavingPassword} type="submit">
              {isSavingPassword ? <Spinner color="current" size="sm" /> : null}
              {isSavingPassword ? 'Saving…' : 'Save'}
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
}
