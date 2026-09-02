'use client';

import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import { ApiError } from '@/shared/api';
import type { Meeting } from '@/entities/meeting';
import { refreshMeetingSummary } from '../api';

interface RefreshMeetingSummaryButtonProps {
  meetingId: string;
  isDisabled: boolean;
  onRefreshed: (meeting: Meeting) => void;
  // The button lives in the summary card's header, while its error (like
  // every other alert on that card) renders in the content below — so the
  // error is reported up rather than rendered by this component itself,
  // keeping this a pure header control.
  onError: (message: string | null) => void;
  onSessionExpired: () => void;
}

export function RefreshMeetingSummaryButton({
  meetingId,
  isDisabled,
  onRefreshed,
  onError,
  onSessionExpired,
}: RefreshMeetingSummaryButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onError(null);
    try {
      const meeting = await refreshMeetingSummary(meetingId);
      onRefreshed(meeting);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      // The refresh request itself failed (network/auth) — leave the
      // displayed summary exactly as it was, since nothing on the server
      // actually changed.
      onError(
        error instanceof ApiError
          ? error.message
          : 'Failed to refresh the summary. Please try again.',
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Button
      isDisabled={isDisabled}
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
  );
}
