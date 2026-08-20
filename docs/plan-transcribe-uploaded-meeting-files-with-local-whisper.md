# Plan: Local Whisper Transcription for Uploaded Meeting Files

**PRD:** @docs/prd-transcribe-uploaded-meeting-files-with-local-whisper.md

**Research:** @docs/research-transcribe-uploaded-meeting-files-with-local-whisper.md

**Date:** 2026-08-20

## Open technical decision the PRD deliberately left unresolved

The PRD's "Technical limitations" section notes the API has no background job/queue infrastructure today (only in-process, synchronous `@nestjs/cqrs` handlers) and says the PRD "does not prescribe which one" to introduce. Phase 2 below resolves this: transcription runs as an **in-process, fire-and-forget async task** (dispatched after the upload/refresh command's DB write commits, not awaited by the HTTP response), not a durable external queue (e.g. BullMQ/Redis). This matches the PRD's own "Out of scope" note that multi-job concurrency/queueing guarantees aren't required for this iteration, and avoids adding new infrastructure (Redis, a worker process) for a single-server, best-effort feature. A job lost to a server restart mid-transcription is left in `PROCESSING` with no automatic resume — the user's only recovery path is the "Refresh Transcription" button (Phase 3/5), consistent with the PRD's "no silent retries" rule.

## Implementation Phases

### Phase 1-transcribe-uploaded-files: Database — transcription status/text columns and invalidation on file change

**Goal:** The `Meeting` model can hold a transcription status and transcript text, following the existing convention of storing single-file-per-meeting state as nullable columns directly on `Meeting` (no separate model, same as the existing `file*` columns). Uploading a new file or deleting the existing file always clears any prior transcription state, since a transcript is tied to one specific uploaded file.

**Affects:** database, backend

**Tasks:**

- [ ] Add a `TranscriptionStatus` enum (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`) to `apps/api/prisma/schema.prisma` — the schema's first enum
- [ ] Add nullable columns to `Meeting`: `transcriptionStatus TranscriptionStatus?`, `transcriptionText String?`, `transcriptionUpdatedAt DateTime?` (null means "no file / not yet transcribed", mirroring how the existing `file*` columns are all-null until a file exists)
- [ ] Create and run the Prisma migration (`npm run db:migrate:dev --workspace=api`), then apply it to the test database (`DATABASE_URL=<test-url> npm run db:migrate:deploy --workspace=api`)
- [ ] Update `UploadMeetingFileHandler` (`apps/api/src/meetings/commands/handlers/upload-meeting-file.handler.ts`) so the same transaction that writes the new file metadata also resets `transcriptionStatus`/`transcriptionText`/`transcriptionUpdatedAt` to `null` (both for a first upload and a replace) — no automatic re-trigger yet, that's Phase 2
- [ ] Update `DeleteMeetingFileHandler` (`apps/api/src/meetings/commands/handlers/delete-meeting-file.handler.ts`) to clear the same three columns to `null` alongside the existing file columns
- [ ] Extend the existing e2e coverage in `apps/api/test/meeting-file-upload.e2e-spec.ts` and `apps/api/test/meeting-file-management.e2e-spec.ts`: re-uploading a file with a previously-set transcription clears it to null; deleting a file clears it to null

**When ready:** Migration applies cleanly against the dev and test databases; existing and extended e2e suites pass; a manual `psql` check confirms the three new columns exist and are nulled out by upload/delete.

### Phase 2-transcribe-uploaded-files: Backend — local Whisper "tiny" transcription engine with automatic trigger on upload

**Goal:** Uploading an `.mp4` or `.mp3` file automatically starts local transcription in the background (not blocking the upload response). Status moves `PENDING` → `PROCESSING` → `COMPLETED`/`FAILED`, and the completed transcript text is persisted. No cloud API is called at any point.

**Affects:** backend

**Tasks:**

- [ ] Write e2e tests first in a new `apps/api/test/meeting-file-transcription.e2e-spec.ts`: uploading a short, checked-in speech fixture (e.g. ~2–3 seconds, added under `apps/api/test/fixtures/`, kept short so local tiny-model inference stays fast in CI) leaves status `PENDING` immediately after the upload response, then eventually reaches `COMPLETED` with non-empty transcript text (poll `GET /meetings/:id/file` with a bounded retry loop); a fixture engineered to fail transcription (or a forced-failure test hook) ends in `FAILED`
- [ ] Add a local Whisper "tiny" runtime as an `apps/api` dependency (a Node binding or a bundled/subprocess-invoked binary — no network calls at inference time) and, if the chosen runtime needs it, an audio-extraction/conversion step for video input (`.mp4`) and format normalization for `.mp3`
- [ ] Add a `TranscribeMeetingFileCommand`/handler pair (`apps/api/src/meetings/commands/`) that: sets status to `PROCESSING`, runs the local Whisper tiny model against the meeting's currently-stored file, and on success writes `transcriptionText` + status `COMPLETED` + `transcriptionUpdatedAt`; on any error, writes status `FAILED` (transcript left as-is/null) — scoped to the meeting's file path at the time the job started, same lookup shape `GetMeetingFileHandler` uses
- [ ] Wire `UploadMeetingFileHandler` (Phase 1) to, after its transaction commits, set `transcriptionStatus` to `PENDING` and dispatch `TranscribeMeetingFileCommand` on the `CommandBus` without awaiting it (fire-and-forget, per the "Open technical decision" above) — the HTTP response returns as soon as the upload itself is done
- [ ] Extend `GET /meetings/:id/file` (`MeetingsController.getFileMetadata`, `GetMeetingFileQuery`/handler) to include `transcriptionStatus` and `transcriptionText` in the response
- [ ] Guard against the file being replaced/deleted while a transcription job is mid-flight: the job re-reads the meeting row before writing its result and no-ops (does not overwrite) if `filePath` no longer matches the path it started with

**When ready:** New e2e suite passes; a manual upload of a real short mp3/mp4 via `curl` results, after polling, in a persisted transcript readable via `GET /meetings/:id/file`; no outbound network call is made during transcription (verifiable by running with network disabled).

### Phase 3-transcribe-uploaded-files: Backend — "Refresh Transcription" endpoint

**Goal:** The meeting's organizer can force a fresh transcription run of the currently-uploaded file at any time (after success or failure), discarding the previous transcript/status first.

**Affects:** backend

**Tasks:**

- [ ] Write e2e tests first: organizer calling refresh on a meeting with a `COMPLETED` transcription resets status to `PENDING` and eventually reaches `COMPLETED` again; refresh on a `FAILED` transcription retries and can reach `COMPLETED`; non-organizer gets `404` (same non-leaking convention as upload/delete); unauthenticated request rejected; refresh on a meeting with no uploaded file rejected (`404`/`400`)
- [ ] Add a `RefreshTranscriptionCommand`/handler (`apps/api/src/meetings/commands/`), organizer-scoped with the same `findFirst`-by-`id`-and-`organizerId` shape `UploadMeetingFileHandler`/`DeleteMeetingFileHandler` use, that resets `transcriptionStatus` to `PENDING` (clearing prior `transcriptionText`) and dispatches `TranscribeMeetingFileCommand` (Phase 2) the same fire-and-forget way
- [ ] Add `POST /meetings/:id/transcription/refresh` to `MeetingsController`, behind the existing `JwtAuthGuard`
- [ ] Reject the request when the meeting currently has no file (`filePath` null) with a clear error

**When ready:** New e2e cases pass; a manual `curl` refresh call against a completed transcription resets and re-completes it.

### Phase 4-transcribe-uploaded-files: Frontend — display transcription status and transcript

**Goal:** On the meeting detail page, any authenticated viewer sees the current transcription status next to the file metadata (Phase 6 of the file-upload feature), and the transcript text once completed, without needing to manually reload to see progress.

**Affects:** frontend

**Tasks:**

- [ ] Extend the `GET /meetings/:id/file` client call in `apps/web/src/lib/api.ts` to include `transcriptionStatus`/`transcriptionText` in its return type
- [ ] Render a status indicator (Pending/Processing/Completed/Failed) in `apps/web/src/components/meeting-file-display.tsx` (or a new sibling component) whenever the meeting has a file
- [ ] When status is `COMPLETED`, render the transcript as plain text
- [ ] While status is `PENDING` or `PROCESSING`, poll `GET /meetings/:id/file` on an interval and stop polling once status becomes `COMPLETED` or `FAILED`, so the organizer sees progress without a manual page reload
- [ ] When status is `FAILED`, show a clear failure indicator (visible to any viewer, not only the organizer)
- [ ] Playwright test: upload a short fixture file, observe the status progress from Pending/Processing to Completed and the transcript render; a second, non-organizer authenticated user viewing the same meeting sees the same status/transcript

**When ready:** Visually verified with Playwright per the task above.

### Phase 5-transcribe-uploaded-files: Frontend — "Refresh Transcription" button

**Goal:** The organizer sees a "Refresh Transcription" control on the meeting detail page (whenever a file exists, any transcription status) that re-runs transcription and resumes the live status display from Phase 4.

**Affects:** frontend

**Tasks:**

- [ ] Add a `refreshTranscription(id)` call in `apps/web/src/lib/api.ts` hitting `POST /meetings/:id/transcription/refresh` (Phase 3)
- [ ] Render the "Refresh Transcription" button only when `isOrganizer` is true and the meeting has a file
- [ ] Disable the button while status is already `PENDING`/`PROCESSING`, to prevent redundant concurrent refresh clicks
- [ ] On click, call the endpoint, immediately reflect `PENDING` status client-side, and resume Phase 4's polling until it settles
- [ ] Show error feedback if the refresh request itself fails (network/auth error), without changing the displayed transcription status
- [ ] Playwright test: organizer clicks "Refresh Transcription" on a completed transcription and sees status revert to pending/processing then complete again; a non-organizer viewing the same meeting never sees the button

**When ready:** Visually verified with Playwright per the task above.

## Phasing Rules

- Each phase produces a workable, independently stoppable result.
- Phase 1 is the minimum tracer-bullet path (schema + invalidation an actual foundation to build the transcription engine on).
- No phase exceeds seven tasks.
- Backend and frontend work are split into separate phases (Phases 1–3 backend/database, Phases 4–5 frontend).
- Backend phases specify e2e tests written before the handlers they cover, per this repo's TDD convention.
- Frontend phases specify Playwright-based visual verification as their test/definition-of-done mechanism, since `apps/web` has no automated test framework configured.
