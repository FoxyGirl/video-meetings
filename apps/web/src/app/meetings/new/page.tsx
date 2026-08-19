'use client';

import { useEffect, useState } from 'react';
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
  TextArea,
  TextField,
} from '@heroui/react';
import { ApiError, createMeeting } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function NewMeetingPage() {
  const router = useRouter();
  const { auth, isLoading, logout } = useAuth();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [participants, setParticipants] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !auth) {
      router.replace('/login');
    }
  }, [isLoading, auth, router]);

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const meeting = await createMeeting({
        title: title.trim(),
        // datetime-local yields "YYYY-MM-DDTHH:mm" in the browser's local
        // time zone; Date parses that as local time, and toISOString()
        // converts it to the UTC ISO 8601 string CreateMeetingDto expects.
        date: new Date(date).toISOString(),
        participants: participants
          .split(/[,\n]/)
          .map((email) => email.trim())
          .filter(Boolean),
      });
      router.push(`/meetings/${meeting.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        router.replace('/login');
        return;
      }
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Failed to create meeting. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !auth) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-4 py-16 dark:from-zinc-950 dark:via-black dark:to-zinc-950">
      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>New meeting</Card.Title>
          <Card.Description>
            Schedule a new meeting and invite participants.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <TextField name="title" value={title} onChange={setTitle}>
              <Label>Title</Label>
              <Input placeholder="Sprint planning" variant="secondary" />
              <FieldError />
            </TextField>

            <div className="textfield textfield--full-width">
              <label className="label" htmlFor="meeting-date">
                Date and time
              </label>
              <input
                className="input input--secondary"
                id="meeting-date"
                name="date"
                onChange={(e) => setDate(e.target.value)}
                type="datetime-local"
                value={date}
              />
            </div>

            <TextField
              name="participants"
              value={participants}
              onChange={setParticipants}
            >
              <Label>Participants</Label>
              <TextArea
                placeholder="alice@example.com, bob@example.com"
                rows={3}
                variant="secondary"
              />
              <FieldError />
            </TextField>

            {submitError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{submitError}</Alert.Title>
                </Alert.Content>
              </Alert>
            ) : null}

            <Button isPending={isSubmitting} type="submit">
              {isSubmitting ? <Spinner color="current" size="sm" /> : null}
              {isSubmitting ? 'Creating…' : 'Create meeting'}
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
}
