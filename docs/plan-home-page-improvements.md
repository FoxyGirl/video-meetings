# Plan: Home Page Improvements

**PRD:** docs/prd-home-page-improvements.md

**Date:** 2026-09-03

## Implementation Phases

### Phase 1-home-page: Move "New meeting" into the top header

**Goal:** "New meeting" is reachable from the top of the home page, before "Logout", without scrolling.

**Affects:** frontend

**Tasks:**

- [ ] In `apps/web/src/_pages/home/ui/home-page.tsx`, move the "New meeting" trigger out of the "Your meetings" section header row into the top header row, positioned before the "Logout" `<Button>`.
- [ ] Replace the raw-CSS-styled `<Link className="button button--primary button--md">` with a HeroUI `<Button>` (linking to `/meetings/new`) so it's visually consistent with "Logout" in the same row.
- [ ] Remove the now-empty control slot next to the "Your meetings" `<h2>` so that row holds only the section title.
- [ ] Update/add a Playwright e2e assertion that "New meeting" precedes "Logout" in the header (DOM order or explicit position check).
- [ ] Manually verify the header in a browser at common viewport widths (desktop + narrow) — no overlap or wrapping regressions.

**When ready:** Home page renders "New meeting" before "Logout" in the top header; the "Your meetings" header row no longer has a button; e2e test passes; PRD acceptance criteria for button placement are met.

---

### Phase 2-home-page: Backend — delete meeting endpoint

**Goal:** An organizer can delete their own meeting via the API; everything else gets a 404.

**Affects:** backend

**Tasks:**

- [ ] Add `DELETE /meetings/:id` to `apps/api/src/meetings/meetings.controller.ts`, behind the existing auth guard.
- [ ] Implement a `delete-meeting` command handler mirroring the `SELECT ... FOR UPDATE WHERE id = ... AND organizerId = ...` pattern from `apps/api/src/meetings/commands/handlers/delete-meeting-file.handler.ts`, throwing `NotFoundException` (404) when no matching row is locked — never a 403.
- [ ] In the same handler, unlink every on-disk file belonging to the meeting's `MeetingFile` rows (mirroring the `unlink` calls already used by the delete-file handler), then delete the `Meeting` row — Prisma cascade removes the dependent `MeetingFile`/action item/decision DB rows automatically.
- [ ] Unit tests for the handler: organizer deletes successfully (files unlinked, row removed); non-organizer gets 404; nonexistent meeting id gets 404.
- [ ] `apps/api` e2e test for `DELETE /meetings/:id`: organizer deletes and a subsequent `GET /meetings/:id` 404s; non-organizer attempt 404s and leaves the meeting intact; nonexistent id 404s.

**When ready:** `npm run test --workspace=api` and the api e2e suite pass; a manual `curl`/Postman delete by the organizer removes the meeting and its files from disk; PRD acceptance criteria for the delete endpoint's 404 behavior are met.

---

### Phase 3-home-page: Frontend — delete meeting UI

**Goal:** Organizers can delete a meeting from the UI with confirmation; non-organizers never see the option; lists update after deletion.

**Affects:** frontend

**Tasks:**

- [ ] Add a `delete-meeting` feature slice (e.g. `apps/web/src/features/delete-meeting`) with a delete trigger + confirmation dialog, mirroring the structure of `apps/web/src/features/delete-meeting-file/ui/delete-meeting-file-button.tsx`.
- [ ] Wire the confirmed action to `DELETE /meetings/:id`.
- [ ] Surface the delete action only for meetings the current user organizes (home page meeting cards and/or meeting detail page), gated the same way `widgets/meeting-files/ui/meeting-file-list.tsx` already gates the file-delete action to the organizer.
- [ ] After a successful delete, update local state/refetch so the meeting no longer appears in "Last three meetings" or "Your meetings".
- [ ] Playwright e2e: organizer deletes a meeting via confirm and it disappears from both lists; canceling the confirmation leaves the meeting in place; a non-organizer participant does not see a delete action on a meeting they don't own.

**When ready:** e2e suite passes; deleting a meeting in the browser removes it from both home-page lists after confirmation; canceling is a no-op; PRD acceptance criteria for the delete UI (visibility, confirmation, list update) are met.

---

### Phase 4-home-page: Disable file actions while summary is generating

**Goal:** "Refresh Transcription" and "Delete" (file) are disabled for every file on a meeting while that meeting's summary is generating, and re-enable once generation finishes.

**Affects:** frontend

**Tasks:**

- [ ] Wherever the meeting detail page/widget already holds the fetched `Meeting` (including `summaryStatus`), derive `isSummaryProcessing = summaryStatus === 'PROCESSING'`.
- [ ] Pass `isSummaryProcessing` down to `MeetingTranscriptionCard` and combine it (OR) with the existing per-file `isDisabled` logic already passed to `RefreshTranscriptionButton`.
- [ ] Add an `isDisabled` prop to `delete-meeting-file-button.tsx` (it currently has none) and wire it from the parent using `isSummaryProcessing`, following the same organizer-gating flow already in `meeting-file-list.tsx`.
- [ ] Playwright e2e: with a meeting whose `summaryStatus` is `PROCESSING`, both "Refresh Transcription" and "Delete" render disabled for its files; once status moves to `COMPLETED`/`FAILED`, both re-enable (still respecting existing per-file transcription-status rules).

**When ready:** e2e suite passes; manually driving a meeting through summary generation shows both buttons disabled during `PROCESSING` and enabled again after; PRD acceptance criteria for button disabling are met.

---

## Notes

- Phases 2 and 3 together deliver the "Delete meeting" capability from the PRD; Phase 2 is usable/testable on its own via direct API calls before any UI exists.
- Phase 4 has no backend task: `summaryStatus` is already persisted on `Meeting` and available wherever the meeting detail page already fetches meeting data — this phase is pure frontend wiring.
- Each phase leaves the app in a working, deployable state; you can stop after any phase.
