# PRD: Meeting recording file upload, storage, and display

**Date**: 2026-07-22
**Status**: Draft

## Purpose

A meeting organizer needs to attach a recording file to one of their meetings so it is stored on the server and can later be reviewed or downloaded, with a clear interface on the meeting page to upload, see, and retrieve that file. Any authenticated user — not only the organizer — can view a meeting's file metadata and download the file itself.

## User Scenarios

- Organizer opens a meeting they own that has no recording yet -> sees an upload control on the meeting detail page.
- Organizer selects a valid audio/video file and uploads it -> the file is validated, stored on the API server, and its metadata (name, size, upload date) is associated with the meeting.
- Organizer reopens a meeting that already has a stored recording -> sees the file's metadata and a download action, instead of the upload control.
- Organizer selects a file with an invalid type or that exceeds the size limit -> upload is rejected with a clear error message, and no file is stored.
- Organizer uploads a new file to a meeting that already has one -> the previous file is replaced (old file deleted from disk, new metadata persisted).
- Organizer deletes the meeting's stored file -> the file is removed from disk and the meeting detail page reverts to showing the upload control.
- Any authenticated user who does not organize a given meeting requests its file metadata or downloads its file -> request succeeds, since view/download access is open to all authenticated users.
- A user who does not organize a given meeting attempts to upload a new file, replace the existing one, or delete it -> request is rejected, since those actions remain restricted to the organizer.
- An unauthenticated request to view metadata, download, upload, or delete a meeting's file -> request is rejected (existing `JwtAuthGuard` behavior).

## In scope

- API endpoint to upload a single recording file (audio/video) to a specific meeting, protected by the existing `JwtAuthGuard` and scoped to the meeting's organizer (only the organizer may upload).
- Server-side validation of uploaded files: allowed audio/video MIME types/extensions (see "Accepted file types" below) and a maximum file size.
- Persisting uploaded files on local disk on the API server, with file metadata (original file name, stored path, MIME type, size, uploaded date) recorded against the meeting (requires a Prisma schema change).
- API endpoint to fetch a meeting's file metadata (so the UI can render "has a file" vs "no file" state), accessible to **any authenticated user**, not scoped to the organizer.
- API endpoint to download/stream the stored file for a meeting, accessible to **any authenticated user**, not scoped to the organizer.
- API endpoint to delete a meeting's stored file, scoped to the organizer (only the organizer may delete).
- Replacing behavior: uploading a new file to a meeting that already has one deletes the old file from disk and stores the new one in its place (organizer-only, same as upload).
- Web UI on the meeting detail page: file picker and upload action, shown to the organizer when the meeting has no stored file.
- Web UI on the meeting detail page: file metadata display (name, size, upload date) and a download action, shown to any authenticated user when the meeting has a stored file.
- Web UI action to delete the current file from the meeting detail page, shown to the organizer only.
- Upload progress indicator and user-facing error feedback (invalid type, file too large, upload failure) in the web UI.
- Client-side validation of file type/size before submitting, mirroring the server-side rules.

## Accepted file types

Only common recording formats are accepted; anything else is rejected by server-side validation:

| Extension | MIME type         |
| --------- | ----------------- |
| `.mp4`    | `video/mp4`       |
| `.webm`   | `video/webm`      |
| `.mov`    | `video/quicktime` |
| `.mp3`    | `audio/mpeg`      |
| `.wav`    | `audio/wav`       |
| `.m4a`    | `audio/mp4`       |
| `.ogg`    | `audio/ogg`       |

Validation checks both the file extension and the declared MIME type — a mismatch (e.g. a `.mp4` extension with a non-video MIME type) is rejected.

## Out of scope

- Automated processing of the uploaded file: transcription, summarization, AI analysis, waveform/thumbnail generation.
- In-browser streaming playback of the recording — only download is supported this iteration.
- Multiple files per meeting or file version history — one file per meeting, always replaced on re-upload.
- External/object storage (e.g. S3-compatible) — local disk only for this iteration.
- Restricting view/download to a meeting's invited participants specifically — access is open to any authenticated user in the system, not matched against the meeting's `participants` list (those remain unauthenticated email strings, not linked `User` accounts, so participant-specific access isn't feasible without separate, larger auth work).
- Virus/malware scanning of uploaded files.
- Resumable or chunked uploads for very large files.
- Per-user or per-organization storage quota management.

## Technical limitations

- No file storage integration exists in this repo today (no `multer`, S3, or equivalent configured anywhere in `apps/api`); this iteration assumes local disk storage on the API server, which does not scale across multiple API instances and is lost if the server's disk isn't persisted (relevant for containerized/ephemeral deployments).
- The `Meeting` Prisma model (`apps/api/prisma/schema.prisma`) has no file-related fields; a migration is required to persist file metadata.
- The API has no configured maximum request/body size for file uploads; NestJS/Express defaults are far smaller than a typical recording file and must be raised deliberately.
- The existing `GetMeetingHandler` scopes meeting reads strictly by `organizerId`, so a non-organizer can't fetch the meeting's own details today even though this PRD opens its file's metadata/download to any authenticated user — the file endpoints must look the meeting up unscoped (by id only) rather than reusing that organizer-scoped query, and the web UI needs a way for a non-organizer to reach a meeting's file (e.g. a direct link) since the meeting detail page itself isn't opened up by this PRD.
- There is no participant authentication in the system, so "any authenticated user" means any registered user, not specifically the meeting's invited participants.
- No virus/malware scanning capability exists anywhere in the current stack.

## Acceptance Criteria

- [ ] An authenticated organizer can upload an audio/video recording file to one of their own meetings from the meeting detail page.
- [ ] Uploading a file that fails type or size validation is rejected with a clear, specific error message, and no file is stored.
- [ ] After a successful upload, the file's metadata (name, size, upload date) is persisted and visible on the meeting detail page across page reloads.
- [ ] An organizer can download the previously uploaded file for their meeting from the meeting detail page.
- [ ] Uploading a new file to a meeting that already has one replaces the previous file, and the old file is removed from disk.
- [ ] An organizer can delete a meeting's uploaded file, after which the meeting detail page reverts to showing the upload control.
- [ ] Any authenticated user (organizer or not) can fetch a meeting's file metadata and download its file.
- [ ] A user who does not organize a given meeting cannot upload a new file, replace the existing one, or delete it (verified at the API level).
- [ ] An unauthenticated request cannot view metadata, download, upload, or delete a meeting's file.
- [ ] e2e test: organizer uploads a valid accepted-type file to their meeting and receives its persisted metadata.
- [ ] e2e test: uploading a file of a disallowed type (extension, MIME type, or a mismatch between the two) is rejected and no file is persisted.
- [ ] e2e test: uploading a file exceeding the maximum size is rejected and no file is persisted.
- [ ] e2e test: organizer downloads a previously uploaded file and receives the correct content and headers.
- [ ] e2e test: an authenticated user who does not organize the meeting successfully fetches its file metadata and downloads its file.
- [ ] e2e test: uploading a new file to a meeting that already has one replaces it — the old file is gone and a subsequent metadata fetch reflects the new file.
- [ ] e2e test: organizer deletes a meeting's file, after which a metadata fetch indicates no file is present.
- [ ] e2e test: a user who does not organize the meeting is rejected when attempting to upload, replace, or delete its file.
- [ ] e2e test: an unauthenticated request is rejected for each of view metadata, download, upload, and delete.
