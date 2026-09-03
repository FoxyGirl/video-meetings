'use client';

import { useState } from 'react';
import { Alert, AlertDialog, Button } from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { ApiError } from '@/shared/api';
import { deleteMeeting } from '@/entities/meeting';

interface DeleteMeetingButtonProps {
  meetingId: string;
  meetingTitle: string;
  onDeleted: () => void;
  onSessionExpired: () => void;
}

export function DeleteMeetingButton({
  meetingId,
  meetingTitle,
  onDeleted,
  onSessionExpired,
}: DeleteMeetingButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Clear any error from a previous attempt so reopening the dialog
      // (e.g. after Cancel) doesn't look like the new attempt already
      // failed before the user has done anything.
      setDeleteError(null);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteMeeting(meetingId);
      setIsOpen(false);
      onDeleted();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      setDeleteError(
        error instanceof ApiError
          ? error.message
          : 'Failed to delete the meeting. Please try again.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button variant="danger">
        <Trash2 size={16} />
        Delete
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.CloseTrigger isDisabled={isDeleting} />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete this meeting?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="flex flex-col gap-4">
              <p>
                This will permanently delete <strong>{meetingTitle}</strong>,
                including its recordings, transcripts, and summary. This action
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
                onPress={() => setIsOpen(false)}
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
  );
}
