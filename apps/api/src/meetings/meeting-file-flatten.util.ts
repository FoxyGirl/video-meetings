import { Meeting, MeetingFile } from '../../prisma/generated/prisma/client';

// Phase 1-multi-file-upload-drag-drop-fix moved file/transcription state off
// Meeting onto its own MeetingFile row, but every existing route's response
// shape must stay byte-for-byte unchanged — this re-flattens a meeting's
// file row back onto the old field names clients and e2e tests still expect
// directly on the meeting object.
//
// Deliberately partial now that a meeting can hold multiple files (see
// list-meeting-files.handler.ts): GetMeetingHandler/GetMeetingsHandler still
// call this with only the first (oldest) MeetingFile, so GET /meetings and
// GET /meetings/:id only ever surface that one file, never the rest. This is
// a legacy compatibility view, not the source of truth for a meeting's
// files — GET /meetings/:id/files is.
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
