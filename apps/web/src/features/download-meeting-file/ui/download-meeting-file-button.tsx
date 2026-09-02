'use client';

import { useState } from 'react';
import { Alert, Button, Spinner } from '@heroui/react';
import { Download } from 'lucide-react';
import { ApiError } from '@/shared/api';
import {
  downloadMeetingFile,
  type MeetingFileMetadata,
} from '@/entities/meeting-file';

interface DownloadMeetingFileButtonProps {
  meetingId: string;
  file: MeetingFileMetadata;
  onSessionExpired: () => void;
}

export function DownloadMeetingFileButton({
  meetingId,
  file,
  onSessionExpired,
}: DownloadMeetingFileButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadMeetingFile(meetingId, file.id, file.originalName);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      setDownloadError(
        error instanceof ApiError
          ? error.message
          : 'Download failed. Please try again.',
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {downloadError ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{downloadError}</Alert.Title>
          </Alert.Content>
        </Alert>
      ) : null}
      <Button
        isPending={isDownloading}
        variant="secondary"
        onPress={handleDownload}
      >
        {isDownloading ? (
          <Spinner color="current" size="sm" />
        ) : (
          <Download size={16} />
        )}
        {isDownloading ? 'Downloading…' : 'Download'}
      </Button>
    </div>
  );
}
