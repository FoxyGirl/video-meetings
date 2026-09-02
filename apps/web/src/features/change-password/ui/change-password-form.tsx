'use client';

import { useState } from 'react';
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
import { PasswordVisibilityToggle } from '@/components/password-visibility-toggle';
import { ApiError } from '@/shared/api';
import { useSession } from '@/entities/session';
import type { UserProfile } from '@/entities/user';
import { changePassword } from '../api';

// Hand-mirrored from apps/api/src/user/dto/change-password.dto.ts's @MinLength(8) on newPassword — keep in sync.
const MIN_NEW_PASSWORD_LENGTH = 8;
// HTTP status ChangePasswordHandler uses for a wrong current password —
// distinct from 401, which means the session itself is invalid. See
// apps/api/src/user/commands/handlers/change-password.handler.ts.
const WRONG_CURRENT_PASSWORD_STATUS = 403;
// Hand-mirrored from ChangePasswordHandler's exact string — keep in sync with
// apps/api/src/user/commands/handlers/change-password.handler.ts.
const SAME_AS_CURRENT_PASSWORD_MESSAGE =
  'New password must differ from current password';

interface ChangePasswordFormProps {
  profile: UserProfile;
  onSessionExpired: () => void;
}

export function ChangePasswordForm({
  profile,
  onSessionExpired,
}: ChangePasswordFormProps) {
  const { login } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isCurrentPasswordVisible, setIsCurrentPasswordVisible] =
    useState(false);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<
    Record<string, string>
  >({});
  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    setPasswordError(null);
    setPasswordFieldErrors({});
    setIsSaving(true);
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
      if (
        error instanceof ApiError &&
        error.status === WRONG_CURRENT_PASSWORD_STATUS
      ) {
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
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
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
      setIsSaving(false);
    }
  };

  return (
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
          onSubmit={onSubmit}
          validationErrors={passwordFieldErrors}
        >
          <TextField
            // isRequired only sets aria-required here — validate's custom
            // message is what actually renders on an empty submit (RAC's
            // own required message would otherwise show instead).
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
            // Same isRequired/validate split as Current password above —
            // the length check below already rejects an empty value, so
            // isRequired here is aria-required only.
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
                onToggle={() => setIsNewPasswordVisible((visible) => !visible)}
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

          <Button isPending={isSaving} type="submit">
            {isSaving ? <Spinner color="current" size="sm" /> : null}
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </Form>
      </Card.Content>
    </Card>
  );
}
