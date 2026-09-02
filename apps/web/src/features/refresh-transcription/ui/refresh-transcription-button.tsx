'use client';

import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import { ApiError } from '@/shared/api';
import { refreshTranscription, type RefreshTranscriptionResult } from '../api';

interface RefreshTranscriptionButtonProps {
  meetingId: string;
  fileId: string;
  isDisabled: boolean;
  onRefreshed: (result: RefreshTranscriptionResult) => void;
  // The button lives in the transcription card's header, while its error
  // (like every other alert on that card) renders in the content below —
  // so the error is reported up rather than rendered by this component
  // itself, keeping this a pure header control.
  onError: (message: string | null) => void;
  onSessionExpired: () => void;
}

export function RefreshTranscriptionButton({
  meetingId,
  fileId,
  isDisabled,
  onRefreshed,
  onError,
  onSessionExpired,
}: RefreshTranscriptionButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onError(null);
    try {
      const result = await refreshTranscription(meetingId, fileId);
      onRefreshed(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      // The refresh request itself failed (network/auth) — the caller's
      // displayed status/text are left exactly as they were, since nothing
      // on the server actually changed.
      onError(
        error instanceof ApiError
          ? error.message
          : 'Failed to refresh transcription. Please try again.',
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
      Refresh Transcription
    </Button>
  );
}
