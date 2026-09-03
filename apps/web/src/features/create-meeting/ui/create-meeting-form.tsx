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
  TextArea,
  TextField,
} from '@heroui/react';
import { ApiError } from '@/shared/api';
import { EMAIL_PATTERN } from '@/shared/lib';
import { createMeeting } from '@/entities/meeting';

function parseParticipants(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

interface CreateMeetingFormProps {
  onSessionExpired: () => void;
}

export function CreateMeetingForm({
  onSessionExpired,
}: CreateMeetingFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [participants, setParticipants] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Clear any previous server-side failure up front, before either the
    // date check below or the async call can short-circuit — otherwise a
    // stale alert from an earlier failed submit could linger on screen
    // alongside a new, unrelated validation message.
    setSubmitError(null);

    // The date field is a plain <input type="datetime-local"> (HeroUI's
    // React-Aria-backed TextField/Input doesn't support that type), so it
    // isn't part of Form's automatic per-field validation like Title and
    // Participants are — it's validated by hand here instead.
    if (!date || Number.isNaN(new Date(date).getTime())) {
      setDateError('Enter a valid date and time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const meeting = await createMeeting({
        title: title.trim(),
        // datetime-local yields "YYYY-MM-DDTHH:mm" in the browser's local
        // time zone; Date parses that as local time, and toISOString()
        // converts it to the UTC ISO 8601 string CreateMeetingDto expects.
        date: new Date(date).toISOString(),
        participants: parseParticipants(participants),
      });
      router.push(`/meetings/${meeting.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
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

  return (
    <Card className="w-full max-w-md">
      <Card.Header>
        <Card.Title>New meeting</Card.Title>
        <Card.Description>
          Schedule a new meeting and invite participants.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <TextField
            isRequired
            name="title"
            value={title}
            onChange={(value) => {
              setTitle(value);
              setSubmitError(null);
            }}
            validate={(value) =>
              value.trim().length === 0 ? 'Title is required.' : null
            }
          >
            <Label>Title</Label>
            <Input placeholder="Sprint planning" variant="secondary" />
            <FieldError />
          </TextField>

          <div className="textfield textfield--full-width">
            <label className="label" htmlFor="meeting-date">
              Date and time
            </label>
            <input
              aria-describedby={dateError ? 'meeting-date-error' : undefined}
              aria-invalid={dateError ? true : undefined}
              className="input input--secondary"
              data-invalid={dateError ? true : undefined}
              id="meeting-date"
              name="date"
              onChange={(e) => {
                setDate(e.target.value);
                setDateError(null);
                setSubmitError(null);
              }}
              type="datetime-local"
              value={date}
            />
            {dateError ? (
              <p
                className="field-error"
                data-visible=""
                id="meeting-date-error"
              >
                {dateError}
              </p>
            ) : null}
          </div>

          <TextField
            isRequired
            name="participants"
            value={participants}
            onChange={(value) => {
              setParticipants(value);
              setSubmitError(null);
            }}
            validate={(value) => {
              const emails = parseParticipants(value);
              if (emails.length === 0) {
                return 'Add at least one participant email.';
              }
              return emails.every((email) => EMAIL_PATTERN.test(email))
                ? null
                : 'Enter valid participant email addresses, separated by commas.';
            }}
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
  );
}
