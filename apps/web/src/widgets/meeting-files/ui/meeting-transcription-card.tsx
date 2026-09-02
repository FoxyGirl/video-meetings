'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Chip,
  Disclosure,
  Spinner,
  type ChipVariants,
} from '@heroui/react';
import { ApiError } from '@/shared/api';
import {
  listMeetingFiles,
  type TranscriptionStatus,
} from '@/entities/meeting-file';
import { RefreshTranscriptionButton } from '@/features/refresh-transcription';

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

interface MeetingTranscriptionCardProps {
  meetingId: string;
  fileId: string;
  status: TranscriptionStatus | null;
  text: string | null;
  isOrganizer: boolean;
  onSessionExpired: () => void;
}

// Renders next to the file's MeetingFileCard, seeded from the file metadata
// the page already fetched (no duplicate fetch on mount). status/text are
// only ever used as the *initial* state here — once mounted, this component
// owns them via its own polling, so a parent re-render with the same seed
// props never resets in-flight progress.
export function MeetingTranscriptionCard({
  meetingId,
  fileId,
  status: initialStatus,
  text: initialText,
  isOrganizer,
  onSessionExpired,
}: MeetingTranscriptionCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState(initialText);
  const [consecutivePollFailures, setConsecutivePollFailures] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // Collapsed by default whenever a transcript exists — local to this one
  // instance, so expanding one file's transcript never affects another
  // file's MeetingTranscriptionCard (each is its own component instance).
  const [isExpanded, setIsExpanded] = useState(false);

  const handleRefreshed = (result: {
    transcriptionStatus: TranscriptionStatus | null;
    transcriptionText: string | null;
  }) => {
    // Reflected locally from the response rather than assumed/waiting for
    // the next poll tick — the status/text useState pair is otherwise only
    // ever updated by the polling effect below, which this also re-arms
    // whenever the result actually is PENDING/PROCESSING (its effect
    // depends on `status`). Using the response's real value (not a
    // hardcoded 'PENDING') matters because the refresh can legitimately
    // no-op server-side (e.g. a concurrent delete/replace already moved the
    // meeting off the file this refresh was scoped to) — trusting a
    // fabricated PENDING in that case would strand the UI showing
    // "Transcribing…" forever, since polling would just see the file gone
    // and stop without ever correcting it.
    setText(result.transcriptionText);
    setStatus(result.transcriptionStatus);
    // A stale failure count from a previous, already-settled polling run
    // shouldn't make this fresh run look like it's already struggling.
    setConsecutivePollFailures(0);
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
      listMeetingFiles(meetingId)
        .then((files) => {
          if (cancelled) {
            return;
          }
          // A meeting can hold up to 10 files, so this has to find its own
          // fileId in the list rather than assume files[0] — otherwise a
          // meeting with more than one file would silently poll (and
          // display) some other file's status. A missing result (this file
          // deleted mid-poll) just stops polling — the page's own delete
          // flow already handles un-rendering this component when it's the
          // organizer doing the deleting.
          const file = files.find((f) => f.id === fileId) ?? null;
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
  }, [status, meetingId, fileId, onSessionExpired]);

  // A null status means "no transcription run has ever started for this
  // file yet" (e.g. transcription was disabled server-side at upload time,
  // or this file predates the transcription migration) — not "no file
  // exists" (the parent widget never mounts this component in that case).
  // The organizer still needs the Refresh button reachable here, since it's
  // the only UI path to trigger a first run without re-uploading the file;
  // a non-organizer has nothing to do with a status-less file, so they see
  // nothing, same as before.
  if (status === null && !isOrganizer) {
    return null;
  }

  const isInProgress = status === 'PENDING' || status === 'PROCESSING';

  return (
    <Card>
      <Card.Header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Card.Title>Transcript</Card.Title>
        {isOrganizer ? (
          <RefreshTranscriptionButton
            fileId={fileId}
            isDisabled={isInProgress}
            meetingId={meetingId}
            onError={setRefreshError}
            onRefreshed={handleRefreshed}
            onSessionExpired={onSessionExpired}
          />
        ) : null}
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        {refreshError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{refreshError}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}

        {status !== null ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Status</span>
            <Chip color={STATUS_COLOR[status]} size="sm">
              <Chip.Label>{STATUS_LABEL[status]}</Chip.Label>
            </Chip>
          </div>
        ) : (
          <p className="text-sm italic text-zinc-500 dark:text-zinc-500">
            No transcription yet.
          </p>
        )}

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
          // Only the transcript text itself collapses — the status chip,
          // spinner, Refresh button, and Failed alert above/below this are
          // all outside the Disclosure and stay visible regardless.
          <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
            <Disclosure.Heading>
              <Button slot="trigger" variant="ghost">
                {isExpanded ? 'Hide transcript' : 'Show transcript'}
                <Disclosure.Indicator />
              </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body>
                {text.length > 0 ? (
                  <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                    {text}
                  </p>
                ) : (
                  // Whisper can genuinely produce an empty transcript (e.g.
                  // a clip with no detectable speech) — an empty string
                  // here is "Completed" behaving correctly, not a
                  // still-loading or broken state, so it needs its own
                  // explicit message rather than silently rendering
                  // nothing.
                  <p className="text-sm italic text-zinc-500 dark:text-zinc-500">
                    No speech detected.
                  </p>
                )}
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
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
