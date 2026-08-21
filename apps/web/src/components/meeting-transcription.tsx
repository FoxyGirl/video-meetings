'use client';

import { useEffect, useState } from 'react';
import { Alert, Card, Chip, Spinner, type ChipVariants } from '@heroui/react';
import { ApiError, getMeetingFile, type TranscriptionStatus } from '@/lib/api';

const STATUS_LABEL: Record<TranscriptionStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

const STATUS_COLOR: Record<TranscriptionStatus, ChipVariants['color']> = {
  PENDING: 'default',
  PROCESSING: 'warning',
  COMPLETED: 'success',
  FAILED: 'danger',
};

const POLL_INTERVAL_MS = 3000;

interface MeetingTranscriptionProps {
  meetingId: string;
  status: TranscriptionStatus | null;
  text: string | null;
  onSessionExpired: () => void;
}

// Renders next to MeetingFileDisplay whenever the meeting has a file,
// seeded from the file metadata the page already fetched (no duplicate
// fetch on mount). status/text are only ever used as the *initial* state
// here — once mounted, this component owns them via its own polling, so a
// parent re-render with the same seed props never resets in-flight
// progress.
export function MeetingTranscription({
  meetingId,
  status: initialStatus,
  text: initialText,
  onSessionExpired,
}: MeetingTranscriptionProps) {
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState(initialText);

  // Bounded to while a transcription job is actually in flight — stops
  // itself once status settles to COMPLETED/FAILED, so a finished
  // transcription never keeps polling in the background.
  useEffect(() => {
    if (status !== 'PENDING' && status !== 'PROCESSING') {
      return;
    }

    let cancelled = false;

    const interval = setInterval(() => {
      getMeetingFile(meetingId)
        .then((file) => {
          if (cancelled) {
            return;
          }
          // A null result (file deleted mid-poll) just stops polling —
          // the page's own delete flow already handles un-rendering this
          // component when it's the organizer doing the deleting.
          if (file === null) {
            clearInterval(interval);
            return;
          }
          setStatus(file.transcriptionStatus);
          setText(file.transcriptionText);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          if (error instanceof ApiError && error.status === 401) {
            clearInterval(interval);
            onSessionExpired();
          }
          // Any other failure is left to retry on the next tick.
        });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status, meetingId, onSessionExpired]);

  if (status === null) {
    return null;
  }

  const isInProgress = status === 'PENDING' || status === 'PROCESSING';

  return (
    <Card>
      <Card.Header>
        <Card.Title>Transcript</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Status</span>
          <Chip color={STATUS_COLOR[status]} size="sm">
            <Chip.Label>{STATUS_LABEL[status]}</Chip.Label>
          </Chip>
        </div>

        {isInProgress ? (
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <Spinner size="sm" />
            Transcribing the recording…
          </div>
        ) : null}

        {status === 'COMPLETED' && text ? (
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {text}
          </p>
        ) : null}

        {status === 'FAILED' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Transcription failed.</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}
      </Card.Content>
    </Card>
  );
}
