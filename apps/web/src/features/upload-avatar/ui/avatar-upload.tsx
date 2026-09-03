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
import { ApiError } from '@/shared/api';
import {
  ACCEPTED_AVATAR_TYPES,
  cacheAvatarPreview,
  validateAvatarFile,
  type UserProfile,
} from '@/entities/user';
import { uploadAvatar } from '../api';

interface AvatarUploadProps {
  onUploaded: (profile: UserProfile) => void;
  onSessionExpired: () => void;
}

export function AvatarUpload({
  onUploaded,
  onSessionExpired,
}: AvatarUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setUploadError(null);
    setValidationError(selected ? validateAvatarFile(selected) : null);
  };

  const handleUpload = async () => {
    if (!file || validationError) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setProgress(0);
    try {
      const profile = await uploadAvatar(file, setProgress);
      cacheAvatarPreview(profile, file);
      onUploaded(profile);
      setFile(null);
      // The native input keeps its own internal file selection independent
      // of React state — without clearing it, re-selecting the exact same
      // file for a follow-up upload wouldn't fire another change event.
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      toast.success('Avatar updated');
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
        <Card.Title>Avatar</Card.Title>
        <Card.Description>
          Upload a photo to display instead of your initials.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <input
          accept={Object.keys(ACCEPTED_AVATAR_TYPES).join(',')}
          className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-zinc-400 dark:file:bg-indigo-950 dark:file:text-indigo-300 dark:hover:file:bg-indigo-900"
          disabled={isUploading}
          ref={inputRef}
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
