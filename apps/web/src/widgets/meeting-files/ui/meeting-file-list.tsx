import {
  MeetingFileCard,
  type MeetingFileMetadata,
} from '@/entities/meeting-file';
import { DownloadMeetingFileButton } from '@/features/download-meeting-file';
import { DeleteMeetingFileButton } from '@/features/delete-meeting-file';
import { MeetingTranscriptionCard } from './meeting-transcription-card';

interface MeetingFileListProps {
  meetingId: string;
  files: MeetingFileMetadata[];
  isOrganizer: boolean;
  isSummaryInProgress: boolean;
  onFileDeleted: (fileId: string) => void;
  onSessionExpired: () => void;
}

// Pairs each file's metadata card with its own transcription card, per
// entry in `files` — the meeting detail page owns fetching/uploading the
// list itself and only hands this widget what to render.
export function MeetingFileList({
  meetingId,
  files,
  isOrganizer,
  isSummaryInProgress,
  onFileDeleted,
  onSessionExpired,
}: MeetingFileListProps) {
  return (
    <>
      {files.map((file) => (
        <div
          key={file.id}
          className="flex flex-col gap-6"
          data-testid={`meeting-file-${file.id}`}
        >
          <MeetingFileCard
            file={file}
            actions={
              <>
                <DownloadMeetingFileButton
                  file={file}
                  meetingId={meetingId}
                  onSessionExpired={onSessionExpired}
                />
                {isOrganizer ? (
                  <DeleteMeetingFileButton
                    file={file}
                    isDisabled={isSummaryInProgress}
                    meetingId={meetingId}
                    onDeleted={() => onFileDeleted(file.id)}
                    onSessionExpired={onSessionExpired}
                  />
                ) : null}
              </>
            }
          />
          <MeetingTranscriptionCard
            fileId={file.id}
            isOrganizer={isOrganizer}
            isSummaryInProgress={isSummaryInProgress}
            meetingId={meetingId}
            status={file.transcriptionStatus}
            text={file.transcriptionText}
            onSessionExpired={onSessionExpired}
          />
        </div>
      ))}
    </>
  );
}
