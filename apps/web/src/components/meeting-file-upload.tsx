'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  ProgressBar,
  Spinner,
  toast,
} from '@heroui/react';
import { Upload } from 'lucide-react';
import {
  ApiError,
  uploadMeetingFile,
  type MeetingFileMetadata,
} from '@/lib/api';
import { ACCEPTED_FILE_TYPES, validateFile } from '@/lib/file-types';

interface MeetingFileUploadProps {
  meetingId: string;
  onUploaded: (metadata: MeetingFileMetadata) => void;
  onSessionExpired: () => void;
}

export function MeetingFileUpload({
  meetingId,
  onUploaded,
  onSessionExpired,
}: MeetingFileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setUploadError(null);
    setValidationError(selected ? validateFile(selected) : null);
  };

  const handleUpload = async () => {
    if (!file || validationError) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setProgress(0);
    try {
      const metadata = await uploadMeetingFile(meetingId, file, setProgress);
      onUploaded(metadata);
      toast.success('Recording uploaded', { description: file.name });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      setUploadError(
        error instanceof ApiError
          ? error.message
          : 'Upload failed. Please try again.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <Card.Header>
        <Card.Title>Upload a recording</Card.Title>
        <Card.Description>
          This meeting doesn’t have a stored recording yet.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <input
          accept={Object.keys(ACCEPTED_FILE_TYPES).join(',')}
          className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-zinc-400 dark:file:bg-indigo-950 dark:file:text-indigo-300 dark:hover:file:bg-indigo-900"
          disabled={isUploading}
          type="file"
          onChange={handleFileChange}
        />

        {validationError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{validationError}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}

        {uploadError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{uploadError}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}

        {isUploading ? (
          <ProgressBar aria-label="Upload progress" value={progress}>
            <ProgressBar.Output />
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        ) : null}

        <Button
          fullWidth
          isDisabled={!file || !!validationError}
          isPending={isUploading}
          onPress={handleUpload}
        >
          {isUploading ? (
            <Spinner color="current" size="sm" />
          ) : (
            <Upload size={16} />
          )}
          {isUploading ? 'Uploading…' : 'Upload'}
        </Button>
      </Card.Content>
    </Card>
  );
}
