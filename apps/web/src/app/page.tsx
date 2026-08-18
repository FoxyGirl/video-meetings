'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, Card, Spinner } from '@heroui/react';
import { CurrentUserAvatar } from '@/components/avatar';
import { ApiError, getMeetings, type Meeting } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const router = useRouter();
  const { auth, isLoading, logout, profile } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [meetingsError, setMeetingsError] = useState<string | null>(null);
  const isMeetingsLoading = meetings === null && meetingsError === null;

  useEffect(() => {
    if (!isLoading && !auth) {
      router.replace('/login');
    }
  }, [isLoading, auth, router]);

  useEffect(() => {
    if (!auth) {
      return;
    }

    let cancelled = false;

    getMeetings()
      .then((data) => {
        if (!cancelled) {
          setMeetings(data);
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
        setMeetingsError(
          error instanceof ApiError
            ? error.message
            : 'Failed to load meetings. Please try again.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [auth, logout, router]);

  if (isLoading || !auth) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const recentMeetings = meetings
    ? [...meetings]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3)
    : [];

  return (
    <div className="flex flex-1 flex-col bg-gradient-to-br from-indigo-50 via-white to-cyan-50 px-4 py-16 dark:from-zinc-950 dark:via-black dark:to-zinc-950">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              aria-label="View profile"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <CurrentUserAvatar size="md" />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Video Meetings
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {profile?.username ?? auth.email}
              </p>
            </div>
          </div>
          <Button variant="secondary" onPress={handleLogout}>
            Logout
          </Button>
        </div>

        {meetingsError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{meetingsError}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}

        {isMeetingsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {recentMeetings.length > 0 ? (
              <section className="flex flex-col gap-4">
                <h2 className="text-lg font-medium text-foreground">
                  Last three meetings
                </h2>
                <div className="flex flex-col gap-3">
                  {recentMeetings.map((meeting) => (
                    <MeetingCard key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-medium text-foreground">
                Your meetings
              </h2>
              {meetings && meetings.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {meetings.map((meeting) => (
                    <MeetingCard key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  You don&apos;t have any meetings yet.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  return (
    <Link
      className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      href={`/meetings/${meeting.id}`}
    >
      <Card className="transition-colors hover:border-indigo-300 dark:hover:border-indigo-700">
        <Card.Header>
          <Card.Title>{meeting.title}</Card.Title>
          <Card.Description>
            {new Date(meeting.date).toLocaleString()}
          </Card.Description>
        </Card.Header>
        {meeting.participants.length > 0 ? (
          <Card.Content>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Participants: {meeting.participants.join(', ')}
            </p>
          </Card.Content>
        ) : null}
      </Card>
    </Link>
  );
}
