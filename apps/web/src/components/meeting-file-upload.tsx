'use client';

import { useRef, useState } from 'react';
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
  const [isDragActive, setIsDragActive] = useState(false);
  // dragenter/dragleave fire for every child element the pointer crosses,
  // not just the drop zone's own boundary — a counter (rather than a plain
  // boolean) avoids the highlight flickering off while dragging over the
  // input or hint text nested inside the zone.
  const dragCounter = useRef(0);

  const applySelectedFile = (selected: File | null) => {
    setFile(selected);
    setUploadError(null);
    setValidationError(selected ? validateFile(selected) : null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applySelectedFile(e.target.files?.[0] ?? null);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isUploading) {
      return;
    }
    dragCounter.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Required even though dragenter already fired — without it the
    // browser rejects the drop and treats it as a navigation attempt.
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isUploading) {
      return;
    }
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragActive(false);
    if (isUploading) {
      return;
    }

    const { files } = e.dataTransfer;
    if (files.length !== 1) {
      setFile(null);
      setUploadError(null);
      setValidationError(
        files.length === 0
          ? 'No file detected in the drop. Please drop a single file.'
          : 'Please drop a single file.',
      );
      return;
    }
    applySelectedFile(files[0]);
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
        <div
          className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
            isDragActive
              ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
              : 'border-zinc-200 dark:border-zinc-800'
          }`}
          data-testid="upload-drop-zone"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            accept={Object.keys(ACCEPTED_FILE_TYPES).join(',')}
            className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-zinc-400 dark:file:bg-indigo-950 dark:file:text-indigo-300 dark:hover:file:bg-indigo-900"
            disabled={isUploading}
            type="file"
            onChange={handleFileChange}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            or drag and drop a file here
          </p>
        </div>

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
