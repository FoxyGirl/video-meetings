# Plan: Meeting recording file upload, storage, and display

**PRD:** @docs/prd-meeting-file-upload-storage-and-display.md

**Date:** 2026-07-22

## Deviations from the PRD (explicitly approved)

- The PRD refers throughout to "the meeting detail page" as if it already exists. It doesn't — `apps/web/src/app` currently has only the home (meeting list), login, and register routes, no `/meetings/[id]` route. Phase 2 below builds it.
- The PRD's technical limitations section states the meeting detail page stays organizer-only, and that non-organizers need a separate way (e.g. a direct link) to reach a meeting's file. This has been superseded: **any authenticated user can view the same meeting detail page as the organizer**, including the file metadata/download section; only upload and delete stay organizer-only, enforced both server-side (as the PRD already requires) and by hiding those controls client-side for non-organizers. This means the existing organizer-scoped `GET /meetings/:id` (`GetMeetingQuery`/`GetMeetingHandler`) must become unscoped by organizer (Phase 1), and there is no separate "direct link" page.

## Implementation Phases

### Phase 1: Backend — open meeting reads to any authenticated user

**Goal:** `GET /meetings/:id` is viewable by any authenticated user, not just the meeting's organizer, so the detail page (Phase 2) and the file endpoints (Phase 4) can share one unscoped lookup. The response still includes `organizerId` so the frontend can determine whether the current viewer is the organizer.

**Affects:** backend

**Tasks:**

- [ ] Update `apps/api/test/meetings.e2e-spec.ts`: replace the existing "non-organizer gets 404" expectation for `GET /meetings/:id` with "any authenticated user can fetch it"; keep the unauthenticated-request-rejected case
- [ ] Change `GetMeetingQuery`/`GetMeetingHandler` to look up the meeting by `id` only (drop `organizerId` scoping), still throwing `NotFoundException` for a genuinely nonexistent id
- [ ] Update `MeetingsController`'s `GET /:id` route to dispatch `GetMeetingQuery(id)` without `organizerId`
- [ ] Confirm `GET /meetings` (the organizer's own list) is untouched — only the single-meeting read changes

**When ready:** e2e tests pass; any authenticated user (organizer or not) can fetch any meeting's details by id; unauthenticated requests are still rejected.

### Phase 2: Frontend — shared meeting detail page shell

**Goal:** Any authenticated user can navigate (directly, by URL) to `/meetings/[id]` and see the meeting's data (title, date, participants). The page determines whether the current viewer is the organizer, for later phases to use. No file-related UI yet.

**Affects:** frontend

**Tasks:**

- [ ] Add a `getMeeting(id)` call to `apps/web/src/lib/api.ts` hitting the now-unscoped `GET /meetings/:id`
- [ ] Create `apps/web/src/app/meetings/[id]/page.tsx` rendering title, date, participants
- [ ] Derive `isOrganizer` by comparing the response's `organizerId` to the current authenticated user's id (from `auth-context`/`auth-store`)
- [ ] Link each meeting in the organizer's home page list to its detail page
- [ ] Handle the nonexistent-meeting response (404) with a clear message
- [ ] Handle the loading state while the meeting is being fetched

**When ready:** Visually verified with Playwright: the organizer opens their own meeting and sees its data; a second authenticated user who is not the organizer opens the same meeting by URL and sees the same data; opening a nonexistent id shows the not-found state.

### Phase 3: Backend — upload endpoint, validation, storage

**Goal:** An organizer can upload a recording file to their own meeting. The file is validated (type/extension/size), stored on local disk, its metadata is persisted, and re-uploading replaces the previous file.

**Affects:** backend, database

**Tasks:**

- [ ] Write e2e tests first in `apps/api/test/`: valid upload persists metadata; disallowed extension rejected; disallowed MIME type rejected; extension/MIME mismatch rejected; oversized file rejected (no file persisted in each rejection case); non-organizer rejected; unauthenticated rejected; re-upload to a meeting that already has a file replaces it (old file removed from disk)
- [ ] Prisma migration: add file metadata fields to the `Meeting` model (original file name, stored path, MIME type, size, uploaded-at)
- [ ] Configure disk storage (e.g. `multer`/`FileInterceptor`) with a dedicated upload directory and a raised body-size limit for this route
- [ ] Implement server-side validation against the accepted file types table (extension + declared MIME type, rejecting mismatches) and the max size limit
- [ ] Add `POST /meetings/:id/file`, organizer-scoped (findFirst by `id` + `organizerId`, same ownership-check shape the old `GetMeetingHandler` used before Phase 1), via a `CommandBus` command/handler
- [ ] Implement replace behavior: delete the old file from disk before writing the new file/metadata
- [ ] Add the new upload directory to `.gitignore` if stored inside the repo tree

**When ready:** All e2e tests in this phase pass (`npm run test:e2e --workspace=api` against the local Postgres test DB); a manual upload via `curl`/Postman against a running API stores the file on disk and returns persisted metadata.

### Phase 4: Backend — metadata, download, and delete endpoints

**Goal:** Any authenticated user can fetch a meeting's file metadata and download the file; only the organizer can delete it.

**Affects:** backend

**Tasks:**

- [ ] Write e2e tests first: non-organizer authenticated user successfully fetches file metadata; non-organizer downloads the file and receives correct content and headers; organizer deletes the file and a subsequent metadata fetch reflects no file present; non-organizer rejected on delete; unauthenticated rejected on metadata, download, and delete
- [ ] Add `GET /meetings/:id/file` returning metadata (name, size, MIME type, uploaded date), 404 when no file exists, using the unscoped-by-id lookup from Phase 1, accessible to any authenticated user
- [ ] Add `GET /meetings/:id/file/download` streaming the stored file with correct `Content-Type` and `Content-Disposition` (original file name), same unscoped lookup, accessible to any authenticated user
- [ ] Add `DELETE /meetings/:id/file`, organizer-scoped (same ownership check as Phase 3's upload), removing the file from disk and clearing its metadata

**When ready:** All e2e tests in this phase pass; a manual download via `curl` returns the original bytes with correct headers.

### Phase 5: Frontend — upload UI and client-side validation

**Goal:** On the meeting detail page, the organizer sees a file picker and upload control when the meeting has no stored file, with client-side validation, upload progress, and error feedback. Non-organizers never see this control.

**Affects:** frontend

**Tasks:**

- [ ] On page load, fetch `GET /meetings/:id/file`; when it indicates no file exists and `isOrganizer` (from Phase 2) is true, render the upload control
- [ ] Client-side validation of extension/MIME type (mirroring the accepted-types table) and max size before submitting
- [ ] Submit the file to `POST /meetings/:id/file` with an upload progress indicator
- [ ] Show clear, specific error feedback for invalid type, oversized file, and upload failure (client-side and server-rejection cases)
- [ ] On successful upload, refresh the page state so it now reflects a stored file (hands off to Phase 6's display)

**When ready:** Visually verified with Playwright: organizer uploads a valid file and sees progress then success; organizer attempts an invalid-type or oversized file and sees the specific rejected-with-reason message; a non-organizer viewing the same meeting never sees the upload control.

### Phase 6: Frontend — file metadata, download, and delete UI

**Goal:** On the meeting detail page, when a file exists, any authenticated viewer sees its metadata and a download action; the organizer additionally sees a delete action, and deleting reverts the page to the upload control for the organizer (and to a "no recording" message for everyone else).

**Affects:** frontend

**Tasks:**

- [ ] Render file metadata (name, size, upload date) and a download action for any viewer when `GET /meetings/:id/file` indicates a file exists
- [ ] Wire the download action to `GET /meetings/:id/file/download` with the auth header
- [ ] Render a delete action only when `isOrganizer` is true
- [ ] Wire delete to `DELETE /meetings/:id/file`; on success, revert the page to the upload control (organizer) / "no recording yet" message (non-organizer)
- [ ] Render a "no recording yet" message (no upload control) when a non-organizer views a meeting with no file

**When ready:** Visually verified with Playwright: organizer sees metadata + download + delete after upload and can delete to revert the page; a second authenticated user (non-organizer) viewing the same meeting by URL sees metadata + download only, can download successfully, and never sees upload/delete controls.

### Phase 7: UI/UX improvements — drag-and-drop file upload zone

**Goal:** On the meeting detail page, the organizer can drag a file directly onto the upload area (in addition to the existing click-to-browse picker from Phase 5) to upload it, with clear visual feedback while dragging.

**Affects:** frontend

**Tasks:**

- [ ] Turn the existing upload control (Phase 5) into a drop zone that listens for `dragenter`/`dragover`/`dragleave`/`drop` events, calling `preventDefault()` so the browser doesn't navigate away when a file is dropped
- [ ] Show an "active" highlighted state (border/background change) on the zone while a file is dragged over it, clearing it on drag-leave or drop
- [ ] On drop, read the file from the drop event's `DataTransfer` and run it through the same client-side validation and upload flow already used for the click-to-browse picker (Phase 5) — no separate validation/upload path
- [ ] Reject drops of multiple files or non-file drag data with the same error feedback pattern as an invalid file type
- [ ] Keep the existing click-to-browse file input working unchanged alongside the new drop zone

**When ready:** Visually verified with Playwright: organizer drags a valid file onto the zone and sees the same progress/success flow as the click-to-browse picker; dragging an invalid file (bad type/oversized) shows the same rejection message as the click flow; the zone visibly highlights on drag-over and un-highlights on drag-leave/drop; non-organizers still never see the control.

## Phasing Rules

- Each phase produces a workable, independently stoppable result.
- Phase 1 is the minimum tracer-bullet path (an actual API change to build on).
- No phase exceeds seven tasks.
- Backend and frontend work for the same capability are always split into separate phases (Phases 1, 3, 4 backend; Phases 2, 5, 6 frontend).
- Backend phases specify e2e tests written before the handlers they cover, per this repo's TDD convention.
- Frontend phases specify Playwright-based visual verification as their test/definition-of-done mechanism, since `apps/web` has no automated test framework configured.
