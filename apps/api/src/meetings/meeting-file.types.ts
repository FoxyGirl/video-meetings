import { $Enums } from '../../prisma/generated/prisma/client';

// Shared response shape for every file-scoped route that returns one file's
// metadata (list, upload's per-file batch results, delete, refresh) — never
// includes filePath, an internal on-disk storage detail no client needs.
export interface MeetingFileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  transcriptionStatus: $Enums.TranscriptionStatus | null;
  transcriptionText: string | null;
}

export function toMeetingFileMetadata(file: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  transcriptionStatus: $Enums.TranscriptionStatus | null;
  transcriptionText: string | null;
}): MeetingFileMetadata {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    uploadedAt: file.uploadedAt,
    transcriptionStatus: file.transcriptionStatus,
    transcriptionText: file.transcriptionText,
  };
}
