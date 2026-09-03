'use client';

import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { CircleStop } from 'lucide-react';
import { ApiError } from '@/shared/api';
import type { Meeting } from '@/entities/meeting';
import { stopMeetingSummary } from '../api';

interface StopMeetingSummaryButtonProps {
  meetingId: string;
  onStopped: (meeting: Meeting) => void;
  // The button lives in the summary card's header, while its error (like
  // every other alert on that card) renders in the content below — so the
  // error is reported up rather than rendered by this component itself,
  // same convention RefreshMeetingSummaryButton follows.
  onError: (message: string | null) => void;
  onSessionExpired: () => void;
}

export function StopMeetingSummaryButton({
  meetingId,
  onStopped,
  onError,
  onSessionExpired,
}: StopMeetingSummaryButtonProps) {
  const [isStopping, setIsStopping] = useState(false);

  const handleStop = async () => {
    setIsStopping(true);
    onError(null);
    try {
      const meeting = await stopMeetingSummary(meetingId);
      onStopped(meeting);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      // The stop request itself failed (network/auth) — leave the
      // displayed summary exactly as it was, since nothing on the server
      // actually changed.
      onError(
        error instanceof ApiError
          ? error.message
          : 'Failed to stop the summary. Please try again.',
      );
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <Button isPending={isStopping} variant="secondary" onPress={handleStop}>
      {isStopping ? (
        <Spinner color="current" size="sm" />
      ) : (
        <CircleStop size={16} />
      )}
      Stop
    </Button>
  );
}
