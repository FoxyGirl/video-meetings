import { $Enums } from '../../../prisma/generated/prisma/client';

export class GetMeetingFileQuery {
  constructor(public readonly meetingId: string) {}
}

// Narrow shape of what GetMeetingFileHandler resolves to — only the file
// columns the metadata/download routes actually need, typed explicitly so
// QueryBus.execute's generic return isn't `any` at the controller call site.
export interface MeetingFileRecord {
  fileOriginalName: string;
  filePath: string;
  fileMimeType: string;
  fileSize: number;
  fileUploadedAt: Date;
  // Independently nullable from the five file columns above (unlike them,
  // not always written together) — a file can exist with no transcription
  // state yet (e.g. the PENDING write hasn't landed, or the row predates
  // this migration), so these stay outside the non-null narrowing
  // GetMeetingFileHandler applies to the file columns.
  transcriptionStatus: $Enums.TranscriptionStatus | null;
  transcriptionText: string | null;
}
