'use client';

import { useState } from 'react';
import { Alert, AlertDialog, Button, Card, Spinner } from '@heroui/react';
import { Download, Trash2 } from 'lucide-react';
import {
  ApiError,
  deleteMeetingFile,
  downloadMeetingFile,
  type MeetingFileMetadata,
} from '@/lib/api';
import { formatFileSize } from '@/lib/file-types';

interface MeetingFileDisplayProps {
  meetingId: string;
  file: MeetingFileMetadata;
  isOrganizer: boolean;
  onDeleted: () => void;
  onSessionExpired: () => void;
}

export function MeetingFileDisplay({
  meetingId,
  file,
  isOrganizer,
  onDeleted,
  onSessionExpired,
}: MeetingFileDisplayProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadMeetingFile(meetingId, file.fileOriginalName);
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

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteMeetingFile(meetingId);
      setIsDeleteOpen(false);
      onDeleted();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      setDeleteError(
        error instanceof ApiError
          ? error.message
          : 'Failed to delete the recording. Please try again.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <Card.Header>
        <Card.Title>Recording</Card.Title>
        <Card.Description className="break-all">
          {file.fileOriginalName}
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <dt className="font-medium text-foreground">Size</dt>
          <dd>{formatFileSize(file.fileSize)}</dd>
          <dt className="font-medium text-foreground">Uploaded</dt>
          <dd>{new Date(file.fileUploadedAt).toLocaleString()}</dd>
        </dl>

        {downloadError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{downloadError}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}

        <div className="flex gap-3">
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

          {isOrganizer ? (
            <AlertDialog isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <Button variant="danger">
                <Trash2 size={16} />
                Delete
              </Button>
              <AlertDialog.Backdrop>
                <AlertDialog.Container>
                  <AlertDialog.Dialog className="sm:max-w-[400px]">
                    <AlertDialog.CloseTrigger />
                    <AlertDialog.Header>
                      <AlertDialog.Icon status="danger" />
                      <AlertDialog.Heading>
                        Delete this recording?
                      </AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body className="flex flex-col gap-4">
                      <p>
                        This will permanently delete{' '}
                        <strong>{file.fileOriginalName}</strong>. This action
                        cannot be undone.
                      </p>
                      {deleteError ? (
                        <Alert status="danger">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Title>{deleteError}</Alert.Title>
                          </Alert.Content>
                        </Alert>
                      ) : null}
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                      <Button
                        isDisabled={isDeleting}
                        variant="tertiary"
                        onPress={() => setIsDeleteOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        isPending={isDeleting}
                        variant="danger"
                        onPress={handleDelete}
                      >
                        Delete
                      </Button>
                    </AlertDialog.Footer>
                  </AlertDialog.Dialog>
                </AlertDialog.Container>
              </AlertDialog.Backdrop>
            </AlertDialog>
          ) : null}
        </div>
      </Card.Content>
    </Card>
  );
}
