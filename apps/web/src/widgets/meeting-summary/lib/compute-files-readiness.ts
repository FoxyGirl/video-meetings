import type { MeetingFileMetadata } from '@/entities/meeting-file';

// A meeting's summary only ever depends on its files' own transcription
// states — this mirrors the "all files terminal" check
// MeetingSummaryTriggerService.maybeTrigger() runs server-side, purely to
// pick the right explanatory copy while summaryStatus is still null (no
// generation has ever been triggered yet).
export type FilesReadiness =
  'no-files' | 'transcribing' | 'all-failed' | 'ready';

export function computeFilesReadiness(
  files: MeetingFileMetadata[],
): FilesReadiness {
  if (files.length === 0) {
    return 'no-files';
  }
  const allTerminal = files.every(
    (file) =>
      file.transcriptionStatus === 'COMPLETED' ||
      file.transcriptionStatus === 'FAILED',
  );
  if (!allTerminal) {
    return 'transcribing';
  }
  const anyCompleted = files.some(
    (file) => file.transcriptionStatus === 'COMPLETED',
  );
  return anyCompleted ? 'ready' : 'all-failed';
}
