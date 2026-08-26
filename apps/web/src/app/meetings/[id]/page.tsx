'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Card, Spinner } from '@heroui/react';
import { FileQuestion } from 'lucide-react';
import { MeetingFileDisplay } from '@/components/meeting-file-display';
import { MeetingFileUpload } from '@/components/meeting-file-upload';
import { MeetingSummary } from '@/components/meeting-summary';
import { MeetingTranscription } from '@/components/meeting-transcription';
import {
  ApiError,
  getMeeting,
  listMeetingFiles,
  type Meeting,
  type MeetingFileMetadata,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MAX_FILES_PER_MEETING } from '@/lib/file-types';

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { auth, userId, isLoading, logout } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [files, setFiles] = useState<MeetingFileMetadata[]>([]);
  const [isFilesLoading, setIsFilesLoading] = useState(true);
  const isMeetingLoading = meeting === null && meetingError === null;

  const handleSessionExpired = useCallback(() => {
    logout();
    router.replace('/login');
  }, [logout, router]);

  useEffect(() => {
    if (!isLoading && !auth) {
      router.replace('/login');
    }
  }, [isLoading, auth, router]);

  useEffect(() => {
    if (meeting) {
      document.title = `${meeting.title} · Video Meetings`;
    }
  }, [meeting]);

  useEffect(() => {
    if (!auth) {
      return;
    }

    let cancelled = false;

    getMeeting(id)
      .then((data) => {
        if (!cancelled) {
          setMeeting(data);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          handleSessionExpired();
          return;
        }
        setMeetingError(
          error instanceof ApiError
            ? error.message
            : 'Failed to load this meeting. Please try again.',
        );
        // There will never be a meeting to fetch files for, so this
        // otherwise never resolves out of its initial loading state.
        setIsFilesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, auth, handleSessionExpired]);

  useEffect(() => {
    if (!auth || !meeting) {
      return;
    }

    let cancelled = false;

    listMeetingFiles(meeting.id)
      .then((data) => {
        if (!cancelled) {
          setFiles(data);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          handleSessionExpired();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFilesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [meeting, auth, handleSessionExpired]);

  const handleFileDeleted = (fileId: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const handleFilesUploaded = (uploaded: MeetingFileMetadata[]) => {
    setFiles((prev) => [...prev, ...uploaded]);
  };

  if (isLoading || !auth) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const isOrganizer = meeting !== null && meeting.organizerId === userId;
  const isBelowFileCap = files.length < MAX_FILES_PER_MEETING;

  return (
    <div className="flex flex-1 flex-col bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-4 py-16 dark:from-zinc-950 dark:via-black dark:to-zinc-950">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Link
          className="inline-flex w-fit items-center py-3 text-sm font-medium text-foreground underline underline-offset-2"
          href="/"
        >
          ← Back to meetings
        </Link>

        <div className="min-h-[220px]">
          {isMeetingLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : meetingError ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{meetingError}</Alert.Title>
              </Alert.Content>
            </Alert>
          ) : (
            meeting && (
              <Card>
                <Card.Header>
                  <Card.Title className="text-xl font-semibold">
                    {meeting.title}
                  </Card.Title>
                  <Card.Description>
                    {new Date(meeting.date).toLocaleString()}
                  </Card.Description>
                </Card.Header>
                <Card.Content className="flex flex-col gap-3">
                  {isOrganizer ? (
                    <p className="text-sm font-medium text-foreground">
                      You are the organizer of this meeting.
                    </p>
                  ) : null}
                  <div>
                    <h4 className="text-sm font-medium text-foreground">
                      Participants
                    </h4>
                    {meeting.participants.length > 0 ? (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {meeting.participants.join(', ')}
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        No participants invited.
                      </p>
                    )}
                  </div>
                </Card.Content>
              </Card>
            )
          )}
        </div>

        {meeting && !isFilesLoading ? (
          <>
            <MeetingSummary
              actionItems={meeting.actionItems}
              decisions={meeting.decisions}
              files={files}
              isOrganizer={isOrganizer}
              meetingId={meeting.id}
              summaryIsPartial={meeting.summaryIsPartial}
              summaryStatus={meeting.summaryStatus}
              summaryText={meeting.summaryText}
              onRefreshed={setMeeting}
              onSessionExpired={handleSessionExpired}
            />

            {files.map((file) => (
              <div
                key={file.id}
                className="flex flex-col gap-6"
                data-testid={`meeting-file-${file.id}`}
              >
                <MeetingFileDisplay
                  file={file}
                  isOrganizer={isOrganizer}
                  meetingId={meeting.id}
                  onDeleted={() => handleFileDeleted(file.id)}
                  onSessionExpired={handleSessionExpired}
                />
                <MeetingTranscription
                  fileId={file.id}
                  isOrganizer={isOrganizer}
                  meetingId={meeting.id}
                  status={file.transcriptionStatus}
                  text={file.transcriptionText}
                  onSessionExpired={handleSessionExpired}
                />
              </div>
            ))}

            {isOrganizer && isBelowFileCap ? (
              <MeetingFileUpload
                meetingId={meeting.id}
                onSessionExpired={handleSessionExpired}
                onUploaded={handleFilesUploaded}
              />
            ) : null}

            {files.length === 0 && !isOrganizer ? (
              <Card>
                <Card.Content className="flex flex-col items-center gap-2 py-8 text-center">
                  <FileQuestion
                    className="text-zinc-400 dark:text-zinc-600"
                    size={32}
                  />
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    No recording yet.
                  </p>
                </Card.Content>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
