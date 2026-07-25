'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Card, Spinner } from '@heroui/react';
import { ApiError, getMeeting, type Meeting } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { auth, userId, isLoading, logout } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const isMeetingLoading = meeting === null && meetingError === null;

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

    getMeeting(id, auth.accessToken)
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
          logout();
          router.replace('/login');
          return;
        }
        setMeetingError(
          error instanceof ApiError
            ? error.message
            : 'Failed to load this meeting. Please try again.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id, auth, logout, router]);

  if (isLoading || !auth) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const isOrganizer = meeting !== null && meeting.organizerId === userId;

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
      </div>
    </div>
  );
}
