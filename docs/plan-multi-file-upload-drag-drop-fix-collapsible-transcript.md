# Plan: Multi-file meeting uploads, drag-and-drop fix, and collapsible transcript

**PRD:** @docs/prd-multi-file-upload-drag-drop-fix-collapsible-transcript.md

**Date:** 2026-08-23

## Open technical decision the PRD deliberately left unresolved

The PRD's "Technical limitations" section notes the existing single-file endpoints (`GET/POST /meetings/:id/file`, `GET /meetings/:id/file/download`, `DELETE /meetings/:id/file`, `POST /meetings/:id/transcription/refresh`) are meeting-scoped, not file-scoped, and says this "needs either a breaking route change... or an additive one." This plan resolves it as a **breaking route change**: the single-file routes are replaced with file-scoped ones (`GET /meetings/:id/files`, `POST /meetings/:id/files`, `GET/DELETE /meetings/:id/files/:fileId`, `POST /meetings/:id/files/:fileId/transcription/refresh`) rather than kept alongside new ones — versioning or dual-running both shapes isn't in the PRD's scope and would add unrequested complexity. The consequence is that **Phase 2 (backend) and Phase 3 (frontend) must ship together** — Phase 2 alone leaves the current web UI unable to upload/download/delete/refresh, since it calls routes that no longer exist. Phase 1 (the schema refactor) has no such constraint: it changes no route or response shape, so it's safely deployable on its own.

## Implementation Phases

### Phase 1-multi-file-upload-drag-drop-fix: Database & backend refactor — introduce `MeetingFile` with no behavior change

**Goal:** File and transcription state moves off `Meeting` onto a new `MeetingFile` model (one-to-many), but every existing route, response shape, and behavior (one file per meeting, upload replaces the old one) stays exactly as it is today. A pure internal refactor that lays the groundwork for Phase 2, with no user-visible or API-contract change.

**Affects:** database, backend

**Tasks:**

- [ ] Add a `MeetingFile` model to `apps/api/prisma/schema.prisma` (`id`, `meetingId` FK + `@@index`, `originalName`, `filePath`, `mimeType`, `size`, `uploadedAt`, `transcriptionStatus`, `transcriptionText`, `transcriptionUpdatedAt`, `createdAt`, `updatedAt`, per this repo's Prisma conventions), and remove the corresponding fields from `Meeting`.
- [ ] Write and run the migration (`npm run db:migrate:dev --workspace=api`), including a data-migration step that moves each existing meeting's non-null file/transcription columns into one `MeetingFile` row; apply the same migration to the `video_meetings_test` database (`db:migrate:deploy`).
- [ ] Update `UploadMeetingFileHandler`, `DeleteMeetingFileHandler`, `GetMeetingFileHandler`, `RefreshTranscriptionHandler`, and the transcription job handler to read/write through `MeetingFile` instead of `Meeting`'s own columns, preserving today's exact behavior (one row per meeting; upload deletes the old row + old on-disk file, then inserts the new one).
- [ ] Keep all existing routes and response shapes byte-for-byte unchanged.
- [ ] Run the existing e2e suites (`meeting-file-upload.e2e-spec.ts`, `meeting-file-management.e2e-spec.ts`, the transcription e2e spec) unmodified against the refactored backend — no test changes should be needed if behavior is truly unchanged.
- [ ] Manual `psql` check confirming the migration correctly backfilled every meeting that had a stored file, with no data loss.

**When ready:** All existing e2e suites pass unmodified; a before/after check on a meeting that had a stored file shows the exact same metadata is now readable via `MeetingFile`; no route, request, or response shape changed.

### Phase 2-multi-file-upload-drag-drop-fix: Backend — multi-file API (additive uploads, per-file endpoints, 10-file cap, batch validation)

**Goal:** The API supports multiple files per meeting: uploads always add a new file and never delete or overwrite an existing one, a list endpoint exposes every file's metadata, and download/delete/transcription-refresh are scoped to one file by its own id. A meeting is capped at 10 files; a batch upload reports each file's individual accept/reject outcome.

**Affects:** backend

**Tasks:**

- [ ] Write e2e tests first (new `apps/api/test/meeting-file-multi-upload.e2e-spec.ts`, extending the existing file-upload/management suites where they overlap): uploading several files in one request persists each as its own `MeetingFile` row without touching existing ones; uploading past the 10-file cap is rejected and the count stays at 10; a batch with one invalid and one valid file persists only the valid one and reports the invalid one's specific rejection reason; deleting one file leaves the others (and their transcripts) untouched; non-organizer/unauthenticated requests are rejected on every file-scoped endpoint.
- [ ] Change the upload endpoint to accept multiple files per request (e.g. `FilesInterceptor` in place of `FileInterceptor`) and change `UploadMeetingFileHandler` to always insert new `MeetingFile` row(s), enforcing the 10-file cap per meeting and returning a per-file accepted/rejected result (with reason) for the whole batch.
- [ ] Add `GET /meetings/:id/files`, returning metadata for every `MeetingFile` on the meeting, open to any authenticated user (same access rule as today's single-file metadata endpoint).
- [ ] Add file-scoped routes: `GET /meetings/:id/files/:fileId/download` (any authenticated user), `DELETE /meetings/:id/files/:fileId` (organizer-only), `POST /meetings/:id/files/:fileId/transcription/refresh` (organizer-only) — each looked up by `fileId` + `meetingId`, matching today's access rules per action.
- [ ] Remove the superseded meeting-scoped single-file routes once the file-scoped ones replace them.
- [ ] Ensure each file's transcription job is triggered/queued independently, so transcribing or refreshing one file's job never reads or writes another file's row.

**When ready:** New e2e suite passes; a manual `curl` batch upload of several files, an 11th-file rejection, a mixed valid/invalid batch, and a per-file delete/refresh all behave per the PRD's acceptance criteria.

### Phase 3-multi-file-upload-drag-drop-fix: Frontend — file list UI, multi-select upload, and drag-and-drop fix

**Goal:** The meeting detail page shows a list of all of a meeting's files (metadata, download, organizer-only delete), replacing the single-file card. The organizer can upload several files at once via the native picker's multi-select or by dragging multiple files onto the drop zone, with per-file success/failure feedback, and the upload control stays visible below the 10-file cap.

**Affects:** frontend

**Tasks:**

- [ ] Write Playwright tests first (extend/replace `meeting-file-upload.spec.ts`, `meeting-file-management.spec.ts`): multi-select upload of several files all appear in the list; multi-file drag-and-drop upload succeeds; single-file drag-and-drop still succeeds (regression check); uploading an 11th file is rejected and the list stays at 10; a mixed valid/invalid batch shows one success and one file-specific error; deleting one file leaves the rest visible.
- [ ] Update `apps/web/src/lib/api.ts`: replace the single-file calls with `listMeetingFiles`, a multi-file `uploadMeetingFiles`, and file-id-scoped `downloadMeetingFile`/`deleteMeetingFile`/`refreshTranscription`, against Phase 2's new routes.
- [ ] Update `MeetingFileUpload`'s state and markup for multiple files: `<input type="file" multiple>`, and drop handling that iterates every dropped file (removing the current `files.length !== 1` rejection) through the same per-file validation a picker-selected file already gets.
- [ ] Render per-file batch feedback — which files uploaded successfully and which were rejected, each with its own reason — instead of one collapsed message for the whole batch.
- [ ] Replace the single `MeetingFileDisplay` card with a list of file entries (from `listMeetingFiles`), each keeping its own metadata/download/delete UI and its own `MeetingTranscription` instance keyed by file id.
- [ ] Keep the upload control rendered (organizer-only) alongside the file list whenever the meeting is below the 10-file cap, instead of disappearing once any file exists.
- [ ] Visually verify in a browser per this repo's UI-testing rule (multi-select upload, multi-file drag-and-drop, per-file batch error reporting, hitting the 10-file cap, deleting one of several files), plus the `ui-ux-pro-max` skill check.

**When ready:** New/updated Playwright suite passes; manual browser verification confirms multi-select upload, multi-file drag-and-drop, per-file batch error reporting, and independent per-file delete all work as described.

### Phase 4-multi-file-upload-drag-drop-fix: Frontend — collapsible per-file transcript

**Goal:** Each file's transcript section is collapsed by default (whenever a transcript exists) and can be expanded or collapsed independently of every other file's transcript on the same meeting, without changing the status chip, in-progress spinner, Refresh button, or Failed alert, which all stay always visible regardless of collapse state.

**Affects:** frontend

**Tasks:**

- [ ] Write a Playwright test first (extend `meeting-transcription.spec.ts`): a completed transcript starts collapsed; expanding it reveals the text; on a meeting with two files that both have completed transcripts, expanding one leaves the other collapsed.
- [ ] Add local expand/collapse state to `MeetingTranscription` (one instance per file, per Phase 3), defaulting to collapsed whenever `text` is non-null.
- [ ] Add a toggle control that shows/hides only the transcript text block — the status chip, in-progress spinner, Refresh button, and Failed alert remain visible regardless of collapsed state.
- [ ] Keep collapse state purely local to each rendered instance, so multiple files' transcripts on the same page never affect one another.
- [ ] Visually verify in a browser (default-collapsed state, expand/collapse toggling, independence across two files on one meeting), plus the `ui-ux-pro-max` skill check.

**When ready:** Updated Playwright suite passes; manual browser verification confirms the default-collapsed state, independent per-file toggling, and no change to the always-visible status/Refresh/Failed elements.
