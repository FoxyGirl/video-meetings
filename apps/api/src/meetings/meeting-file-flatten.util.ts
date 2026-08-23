import { Meeting, MeetingFile } from '../../prisma/generated/prisma/client';

// Phase 1-multi-file-upload-drag-drop-fix moved file/transcription state off
// Meeting onto its own MeetingFile row, but every existing route's response
// shape must stay byte-for-byte unchanged — this re-flattens a meeting's
// (at most one, this phase) MeetingFile row back onto the old field names
// clients and e2e tests still expect directly on the meeting object.
export function flattenMeetingFile(meeting: Meeting, file: MeetingFile | null) {
  return {
    ...meeting,
    fileOriginalName: file?.originalName ?? null,
    filePath: file?.filePath ?? null,
    fileMimeType: file?.mimeType ?? null,
    fileSize: file?.size ?? null,
    fileUploadedAt: file?.uploadedAt ?? null,
    transcriptionStatus: file?.transcriptionStatus ?? null,
    transcriptionText: file?.transcriptionText ?? null,
    transcriptionUpdatedAt: file?.transcriptionUpdatedAt ?? null,
  };
}
