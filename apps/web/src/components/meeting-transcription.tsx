'use client';

import { Card, Chip, type ChipVariants } from '@heroui/react';
import type { TranscriptionStatus } from '@/lib/api';

const STATUS_LABEL: Record<TranscriptionStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

const STATUS_COLOR: Record<TranscriptionStatus, ChipVariants['color']> = {
  PENDING: 'default',
  PROCESSING: 'warning',
  COMPLETED: 'success',
  FAILED: 'danger',
};

interface MeetingTranscriptionProps {
  status: TranscriptionStatus | null;
}

// Renders next to MeetingFileDisplay whenever the meeting has a file — a
// null status (transcription disabled, or the row predates the
// transcription migration) renders nothing rather than an empty card.
export function MeetingTranscription({ status }: MeetingTranscriptionProps) {
  if (status === null) {
    return null;
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title>Transcript</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Status</span>
          <Chip color={STATUS_COLOR[status]} size="sm">
            <Chip.Label>{STATUS_LABEL[status]}</Chip.Label>
          </Chip>
        </div>
      </Card.Content>
    </Card>
  );
}
