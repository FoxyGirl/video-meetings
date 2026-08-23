# PRD: Multi-file meeting uploads, drag-and-drop fix, and collapsible transcript

**Date**: 2026-08-22
**Status**: Draft

## Purpose

A meeting organizer needs to attach more than one recording/document to a single meeting instead of being limited to one file that gets silently replaced by the next upload. The upload control's drag-and-drop zone must actually accept dropped files — today only the native "choose a file" picker reliably works, which blocks batch uploads. Once a meeting can hold several files, each with its own transcript, the transcript display must be collapsible so the meeting page doesn't turn into a wall of text.

## User Scenarios

- Organizer opens a meeting that already has one or more stored files -> sees a list of files (not a single-file card), each with its own metadata, download, delete, and transcript section.
- Organizer selects several files at once from the native file picker -> all valid files are uploaded (sequentially or in parallel) and added to the meeting's file list; none of the meeting's existing files are removed.
- Organizer drags multiple files from their file manager and drops them onto the drop zone -> all valid files are accepted and uploaded, the same as if they'd been chosen via the picker.
- Organizer drags a single file and drops it -> behaves the same as today (accepted and uploaded), confirming the fix didn't regress the existing single-file case.
- Organizer attempts to upload a file that would exceed the meeting's file-count cap -> the upload is rejected with a clear error message before any request is sent, and no file is stored.
- Organizer uploads a mix of valid and invalid (wrong type/too large) files in one batch -> valid files are uploaded, invalid ones are individually reported as rejected, and the organizer can see which file failed and why.
- Organizer deletes one file from a meeting that has several -> only that file (and its transcript) is removed; the rest of the meeting's files and transcripts are unaffected.
- Any authenticated viewer (organizer or not) opens a meeting with multiple files -> sees the same file list, each with its own transcript section collapsed by default, expandable independently per file.
- Viewer expands one file's transcript -> only that file's transcript opens; other files' transcripts stay collapsed.
- Organizer clicks "Refresh Transcription" on one file in a multi-file meeting -> only that file's transcription job is (re)triggered; other files' transcription status/text are untouched.

## In scope

- Prisma schema change: extract the file + transcription fields currently on `Meeting` (`fileOriginalName`, `filePath`, `fileMimeType`, `fileSize`, `fileUploadedAt`, `transcriptionStatus`, `transcriptionText`, `transcriptionUpdatedAt`) into a new `MeetingFile` model with a one-to-many relation to `Meeting`, so a meeting can hold multiple files, each carrying its own transcription state independently.
- A migration that backfills each existing meeting's single set of file/transcription columns into one corresponding `MeetingFile` row, with no data loss for meetings that currently have a stored file.
- Upload endpoint changes to accept one or more files in a single request (or equivalent repeated single-file requests from the client) and always append new `MeetingFile` rows — never delete or overwrite an existing file as a side effect of a new upload.
- A per-meeting maximum file count of **10** files, enforced server-side; an upload that would exceed the cap is rejected (existing per-file type/size validation rules are unchanged and still apply to each file).
- API endpoints to list a meeting's files (metadata for all files, not just one), download a specific file by its own id, and delete a specific file by its own id — all reusing the existing organizer-only (upload/delete) vs. any-authenticated-user (list/download) access rules from the current single-file endpoints.
- Transcription refresh endpoint updated to target one file by its id (rather than implicitly "the meeting's file"), so refreshing one file's transcript never affects another file on the same meeting.
- Web UI: replace the single-file upload/display components with a file **list** — each entry shows its own metadata, download action, delete action (organizer-only), and its own transcript card.
- Web UI: native file input updated to accept multiple file selection (`multiple` attribute) in one picker interaction.
- Web UI: fix the drag-and-drop zone so a multi-file drop is accepted and each dropped file goes through the same validation/upload path as a picker-selected file, instead of being rejected outright for containing more than one file.
- Web UI: per-file upload feedback — when a batch (multi-select or multi-drop) contains a mix of valid and invalid files, each invalid file is reported individually (name + reason) rather than the whole batch failing as one opaque error.
- Web UI: each file's transcript section becomes collapsible (collapsed by default when a transcript exists), with its own independent expand/collapse state — expanding one file's transcript does not affect any other file's.
- Web UI: the meeting's upload control remains visible (organizer-only) once the file-count cap hasn't been reached yet, alongside the existing file list, instead of disappearing after the first file like it does today.

## Out of scope

- Reordering, renaming, or otherwise editing file metadata after upload.
- Bulk delete (removing multiple files in a single action) — files are deleted one at a time.
- Changing the per-file accepted type list, per-file size limit (500 MB), or storage backend (local disk) — those carry over unchanged from the existing single-file feature.
- Increasing or making the 10-file cap configurable per environment — it's a fixed constant for this iteration.
- Any change to who can see, upload, or delete files (access rules are unchanged, just re-scoped from "the meeting's file" to "a specific file belonging to the meeting").
- Resumable/chunked uploads, parallel upload throttling/queuing UI, or a progress bar aggregated across an entire batch (per-file progress is in scope; a combined batch progress bar is not).
- Collapsing/hiding anything other than the transcript text itself (the status chip, Refresh button, and error/failed states stay always visible, matching today's non-collapsible layout minus the transcript body).

## Technical limitations

- This is a breaking schema change, not an additive one: `filePath`/`transcriptionStatus`/etc. move off `Meeting` entirely onto a new `MeetingFile` model. Every existing call site that reads or writes these fields on `Meeting` (queries, handlers, DTOs, the e2e fixtures listed in `apps/web/CLAUDE.md`'s "Meeting file upload UI" / "transcription" sections) needs updating, not just the new multi-file paths.
- The existing single-file endpoints (`GET/POST /meetings/:id/file`, `GET /meetings/:id/file/download`, `DELETE /meetings/:id/file`, `POST /meetings/:id/transcription/refresh`) are meeting-scoped, not file-scoped; they need either a breaking route change (e.g. `/meetings/:id/files/:fileId/...`) or an additive one, which changes the web client (`api.ts`) call shapes accordingly.
- Whisper transcription today runs one job at a time per the existing local-Whisper integration; uploading several files at once means the API must decide (and this PRD assumes) each file's transcription job is queued/run independently rather than in parallel, since `nodejs-whisper`'s local CPU-bound inference (see root `CLAUDE.md`'s "Local Whisper transcription" section) doesn't have documented behavior for concurrent jobs today.
- The drag-and-drop zone's current implementation (`apps/web/src/components/meeting-file-upload.tsx`) already wires up `dragenter`/`dragover`/`dragleave`/`drop` handlers correctly for a single file; its `handleDrop` explicitly rejects any drop where `files.length !== 1`. The "fix" here is primarily removing that restriction and routing each dropped file through per-file validation — but implementation should first confirm in a real browser whether single-file drag-and-drop is in fact currently working end-to-end (the reported symptom was "only picking a file from your computer works"), since that would point to a different root cause than the multi-file restriction alone.
- e2e fixtures and specs that assume "a meeting has at most one file" (`meeting-file-upload.spec.ts`, `meeting-file-management.spec.ts`, `meeting-transcription.spec.ts`) need rewriting for a list-based model, not just extending.

## Acceptance Criteria

- [ ] A meeting can have more than one stored file at a time; uploading a new file never deletes or overwrites an existing one.
- [ ] An organizer can select multiple files at once in the native file picker and have all valid ones uploaded and added to the meeting's file list.
- [ ] An organizer can drag and drop multiple files at once onto the drop zone and have all valid ones uploaded, with no artificial "one file only" rejection.
- [ ] A single-file drag-and-drop still works after the fix (no regression).
- [ ] Uploading a file once a meeting already has 10 stored files is rejected with a clear error message, and no file is stored.
- [ ] A batch upload containing both valid and invalid files uploads the valid ones and reports each invalid file's name and rejection reason individually.
- [ ] Any authenticated viewer sees a list of all of a meeting's files (not just one), each with its own metadata, download action, and (organizer-only) delete action.
- [ ] Deleting one file removes only that file and its transcript; other files on the same meeting are unaffected.
- [ ] Each file's transcript is collapsed by default and can be expanded/collapsed independently of every other file's transcript on the same meeting.
- [ ] Refreshing one file's transcription only affects that file's transcription status/text.
- [ ] e2e test: uploading multiple files (via picker, multi-select) in one action results in all of them appearing in the meeting's file list.
- [ ] e2e test: dropping multiple files via drag-and-drop results in all of them appearing in the meeting's file list.
- [ ] e2e test: dropping a single file via drag-and-drop still succeeds (regression check).
- [ ] e2e test: uploading an 11th file to a meeting that already has 10 is rejected and the meeting still has exactly 10 files.
- [ ] e2e test: a batch with one invalid-type file and one valid file results in exactly one file being added, with the invalid one's rejection reported.
- [ ] e2e test: deleting one of several files leaves the others (and their transcripts) intact.
- [ ] e2e test: a non-organizer cannot upload, replace, or delete any file on a meeting they don't organize, verified against the new per-file endpoints.
- [ ] e2e test: expanding one file's transcript in the UI does not expand or otherwise affect another file's transcript state.
