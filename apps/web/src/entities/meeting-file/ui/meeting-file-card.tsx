import type { ReactNode } from 'react';
import { Card } from '@heroui/react';
import { formatFileSize, type MeetingFileMetadata } from '../api';

interface MeetingFileCardProps {
  file: MeetingFileMetadata;
  // Download/delete are their own features (features/download-meeting-file,
  // features/delete-meeting-file) — this entity only renders the file's own
  // metadata and a slot for whatever action buttons the caller composes in,
  // so the entity never has to import from a higher layer to render them.
  actions?: ReactNode;
}

export function MeetingFileCard({ file, actions }: MeetingFileCardProps) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Recording</Card.Title>
        <Card.Description className="break-all">
          {file.originalName}
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <dt className="font-medium text-foreground">Size</dt>
          <dd>{formatFileSize(file.size)}</dd>
          <dt className="font-medium text-foreground">Uploaded</dt>
          <dd>{new Date(file.uploadedAt).toLocaleString()}</dd>
        </dl>

        {actions ? <div className="flex gap-3">{actions}</div> : null}
      </Card.Content>
    </Card>
  );
}
