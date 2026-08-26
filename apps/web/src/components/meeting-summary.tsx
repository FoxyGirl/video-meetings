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
  getMeeting,
  listMeetingFiles,
  refreshMeetingSummary,
  type ActionItemMetadata,
  type DecisionMetadata,
  type Meeting,
  type MeetingFileMetadata,
  type SummaryStatus,
} from '@/lib/api';

const STATUS_LABEL: Record<SummaryStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

const STATUS_COLOR: Record<SummaryStatus, ChipVariants['color']> = {
  PENDING: 'default',
  PROCESSING: 'warning',
  COMPLETED: 'success',
  FAILED: 'danger',
};

const POLL_INTERVAL_MS = 3000;

// A meeting's summary only ever depends on its files' own transcription
// states — this mirrors the "all files terminal" check
// MeetingSummaryTriggerService.maybeTrigger() runs server-side, purely to
// pick the right explanatory copy while summaryStatus is still null (no
// generation has ever been triggered yet).
type FilesReadiness = 'no-files' | 'transcribing' | 'all-failed' | 'ready';

function computeFilesReadiness(files: MeetingFileMetadata[]): FilesReadiness {
  if (files.length === 0) {
    return 'no-files';
  }
  const allTerminal = files.every(
    (file) =>
      file.transcriptionStatus === 'COMPLETED' ||
      file.transcriptionStatus === 'FAILED',
  );
  if (!allTerminal) {
    return 'transcribing';
  }
  const anyCompleted = files.some(
    (file) => file.transcriptionStatus === 'COMPLETED',
  );
  return anyCompleted ? 'ready' : 'all-failed';
}

interface MeetingSummaryProps {
  meetingId: string;
  summaryStatus: SummaryStatus | null;
  summaryText: string | null;
  summaryIsPartial: boolean | null;
  actionItems: ActionItemMetadata[];
  decisions: DecisionMetadata[];
  files: MeetingFileMetadata[];
  isOrganizer: boolean;
  onRefreshed: (meeting: Meeting) => void;
  onSessionExpired: () => void;
}

// Renders once per meeting (a meeting has exactly one summary), unlike
// MeetingFileDisplay/MeetingTranscription which render once per file.
// Seeded from the meeting/files data the page already fetched — every seed
// prop is only ever used as *initial* state here; once mounted, this
// component owns all of it via its own polling below, so a parent
// re-render passing the same seed props back in never resets in-flight
// progress (same convention MeetingTranscription's own seed props follow).
export function MeetingSummary({
  meetingId,
  summaryStatus: initialStatus,
  summaryText: initialText,
  summaryIsPartial: initialIsPartial,
  actionItems: initialActionItems,
  decisions: initialDecisions,
  files: initialFiles,
  isOrganizer,
  onRefreshed,
  onSessionExpired,
}: MeetingSummaryProps) {
  const [status, setStatus] = useState(initialStatus);
  const [text, setText] = useState(initialText);
  const [isPartial, setIsPartial] = useState(initialIsPartial);
  const [actionItems, setActionItems] = useState(initialActionItems);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [files, setFiles] = useState(initialFiles);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const meeting = await refreshMeetingSummary(meetingId);
      // Reflected straight from the response, same reasoning
      // refreshTranscription's own handler documents: RefreshMeetingSummaryHandler
      // always discards the existing summary, but whether a new run actually
      // starts depends on the meeting's current file states, so this has to
      // use the response's real values rather than assume PENDING.
      setStatus(meeting.summaryStatus);
      setText(meeting.summaryText);
      setIsPartial(meeting.summaryIsPartial);
      setActionItems(meeting.actionItems);
      setDecisions(meeting.decisions);
      onRefreshed(meeting);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      // The refresh request itself failed (network/auth) — leave the
      // displayed summary exactly as it was, since nothing on the server
      // actually changed.
      setRefreshError(
        error instanceof ApiError
          ? error.message
          : 'Failed to refresh the summary. Please try again.',
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const readiness = computeFilesReadiness(files);
  const isSummaryInProgress = status === 'PENDING' || status === 'PROCESSING';
  // Keeps polling while something could still change what's shown: an
  // in-flight generation run, or a file set that hasn't yet settled into
  // its own final "ready"/"all-failed" shape (which is what ultimately
  // decides whether generation ever starts at all). Stops once both the
  // summary and the file set have reached a stable end state — same "poll
  // only while something is actually still moving" rule
  // MeetingTranscription's own polling effect follows.
  const shouldPoll =
    readiness !== 'no-files' &&
    readiness !== 'all-failed' &&
    status !== 'COMPLETED' &&
    status !== 'FAILED';

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    let cancelled = false;

    const interval = setInterval(() => {
      Promise.all([getMeeting(meetingId), listMeetingFiles(meetingId)])
        .then(([meeting, meetingFiles]) => {
          if (cancelled) {
            return;
          }
          setStatus(meeting.summaryStatus);
          setText(meeting.summaryText);
          setIsPartial(meeting.summaryIsPartial);
          setActionItems(meeting.actionItems);
          setDecisions(meeting.decisions);
          setFiles(meetingFiles);
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
          // Any other failure keeps retrying on the next tick, same as
          // MeetingTranscription's own polling — a transient blip
          // shouldn't stop the poll loop.
        });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shouldPoll, meetingId, onSessionExpired]);

  // Nothing to summarize yet — the upload control (rendered elsewhere on
  // the page) already covers the "no recording yet" empty state.
  if (readiness === 'no-files') {
    return null;
  }

  return (
    <Card data-testid="meeting-summary">
      <Card.Header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Card.Title>Meeting Summary</Card.Title>
        {isOrganizer ? (
          <Button
            isDisabled={isSummaryInProgress}
            isPending={isRefreshing}
            variant="secondary"
            onPress={handleRefresh}
          >
            {isRefreshing ? (
              <Spinner color="current" size="sm" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh Summary
          </Button>
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

        {status === 'PENDING' || status === 'PROCESSING' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Status
              </span>
              <Chip color={STATUS_COLOR[status]} size="sm">
                <Chip.Label>{STATUS_LABEL[status]}</Chip.Label>
              </Chip>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Spinner size="sm" />
              Generating summary…
            </div>
          </>
        ) : null}

        {status === 'FAILED' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Status
              </span>
              <Chip color={STATUS_COLOR.FAILED} size="sm">
                <Chip.Label>{STATUS_LABEL.FAILED}</Chip.Label>
              </Chip>
            </div>
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Summary generation failed.</Alert.Title>
              </Alert.Content>
            </Alert>
          </>
        ) : null}

        {status === null ? (
          <p className="text-sm italic text-zinc-500 dark:text-zinc-500">
            {readiness === 'transcribing'
              ? 'Summary not yet available — recordings are still being transcribed.'
              : readiness === 'all-failed'
                ? 'No summary is available — every recording failed transcription.'
                : 'Summary not yet available.'}
          </p>
        ) : null}

        {status === 'COMPLETED' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Status
              </span>
              <Chip color={STATUS_COLOR.COMPLETED} size="sm">
                <Chip.Label>{STATUS_LABEL.COMPLETED}</Chip.Label>
              </Chip>
            </div>

            {isPartial ? (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>
                    Based on partial input — one or more recordings could not be
                    transcribed.
                  </Alert.Title>
                </Alert.Content>
              </Alert>
            ) : null}

            <div>
              <h4 className="text-sm font-medium text-foreground">Summary</h4>
              <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                {text}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-foreground">
                Action Items
              </h4>
              {actionItems.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                  {actionItems.map((item) => (
                    <li key={item.id}>
                      {item.description}
                      {item.assignee ? (
                        <span className="text-zinc-500 dark:text-zinc-500">
                          {' '}
                          — {item.assignee}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm italic text-zinc-500 dark:text-zinc-500">
                  No action items found.
                </p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-foreground">Decisions</h4>
              {decisions.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                  {decisions.map((decision) => (
                    <li key={decision.id}>{decision.description}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm italic text-zinc-500 dark:text-zinc-500">
                  No decisions found.
                </p>
              )}
            </div>
          </>
        ) : null}
      </Card.Content>
    </Card>
  );
}
