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
import { ApiError } from '@/shared/api';
import type { UserProfile } from '@/entities/user';
import { updateUsername } from '../api';

// Hand-mirrored from apps/api/src/user/dto/update-username.dto.ts's @MaxLength(50) — keep in sync.
const MAX_USERNAME_LENGTH = 50;

interface UpdateUsernameFormProps {
  profile: UserProfile;
  onUpdated: (profile: UserProfile) => void;
  onSessionExpired: () => void;
}

export function UpdateUsernameForm({
  profile,
  onUpdated,
  onSessionExpired,
}: UpdateUsernameFormProps) {
  const [username, setUsername] = useState(profile.username ?? '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    setUsernameError(null);
    setIsSaving(true);
    try {
      const updated = await updateUsername(username.trim() || null);
      onUpdated(updated);
      setUsername(updated.username ?? '');
      toast.success('Username updated');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      setUsernameError(
        error instanceof ApiError
          ? error.message
          : 'Failed to update username. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <Card.Header>
        <Card.Title>Username</Card.Title>
        <Card.Description>
          Shown instead of your email wherever your name appears.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Form className="flex flex-col gap-4" onSubmit={onSubmit}>
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

          <Button isPending={isSaving} type="submit">
            {isSaving ? <Spinner color="current" size="sm" /> : null}
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </Form>
      </Card.Content>
    </Card>
  );
}
