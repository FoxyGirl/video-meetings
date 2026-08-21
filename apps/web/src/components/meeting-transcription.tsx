'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Chip,
  Spinner,
  type ChipVariants,
} from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import {
  ApiError,
  getMeetingFile,
  refreshTranscription,
  type TranscriptionStatus,
} from '@/lib/api';

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
// After this many consecutive non-401 poll failures (a transient network
// blip or a 500, say), surface a visible notice — polling itself keeps
// retrying indefinitely since these should recover on their own, but a
// real outage shouldn't stay silent forever.
const POLL_FAILURE_WARNING_THRESHOLD = 3;

interface MeetingTranscriptionProps {
  meetingId: string;
  status: TranscriptionStatus | null;
  text: string | null;
  isOrganizer: boolean;
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
  isOrganizer,
  onSessionExpired,
}: MeetingTranscriptionProps) {
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState(initialText);
  const [consecutivePollFailures, setConsecutivePollFailures] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshTranscription(meetingId);
      // Reflected locally rather than waiting for the next poll tick — the
      // status/text useState pair is otherwise only ever updated by the
      // polling effect below, which this also re-arms (its effect depends
      // on `status`, so moving it to PENDING here starts polling again).
      setText(null);
      setStatus('PENDING');
      // A stale failure count from a previous, already-settled polling run
      // shouldn't make this fresh run look like it's already struggling.
      setConsecutivePollFailures(0);
    } finally {
      setIsRefreshing(false);
    }
  };

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
          setConsecutivePollFailures(0);
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
            return;
          }
          // Any other failure keeps retrying on the next tick (transient
          // network/API blips should recover on their own) — the growing
          // count only drives the warning notice below, not a retry cap.
          setConsecutivePollFailures((count) => count + 1);
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
      <Card.Header className="flex flex-row items-center justify-between">
        <Card.Title>Transcript</Card.Title>
        {isOrganizer ? (
          <Button
            isDisabled={isInProgress}
            isPending={isRefreshing}
            size="sm"
            variant="secondary"
            onPress={() => void handleRefresh()}
          >
            {isRefreshing ? (
              <Spinner color="current" size="sm" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh Transcription
          </Button>
        ) : null}
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

        {isInProgress &&
        consecutivePollFailures >= POLL_FAILURE_WARNING_THRESHOLD ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                Having trouble checking the transcription status. Still
                retrying…
              </Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}

        {status === 'COMPLETED' && text !== null ? (
          text.length > 0 ? (
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {text}
            </p>
          ) : (
            // Whisper can genuinely produce an empty transcript (e.g. a
            // clip with no detectable speech) — an empty string here is
            // "Completed" behaving correctly, not a still-loading or
            // broken state, so it needs its own explicit message rather
            // than silently rendering nothing.
            <p className="text-sm italic text-zinc-500 dark:text-zinc-500">
              No speech detected.
            </p>
          )
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
