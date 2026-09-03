# PRD: Home Page Improvements

**Date**: 2026-09-03
**Status**: Draft

## Purpose

Fix three usability gaps on the home page and meeting detail flow: the primary "New meeting" action is buried below the fold next to a list header instead of near the top-level page actions; meeting organizers have no way to remove a meeting they created; and file actions (refresh transcription, delete file) remain clickable while a meeting summary is generating, which can race the in-progress generation.

## User Scenarios

- User loads the home page -> "New meeting" button is visible in the top header row, before "Logout", without scrolling.
- Organizer opens their own meeting (from the home page or the meeting detail page) -> sees a "Delete" action for that meeting.
- Organizer clicks "Delete meeting" and confirms -> the meeting, its files (including on-disk files), transcriptions, action items, decisions, and summary are removed, and the meeting disappears from "Last three meetings" and "Your meetings".
- Organizer clicks "Delete meeting" and cancels the confirmation -> nothing is deleted.
- Participant who is not the organizer views a meeting they don't own -> no "Delete meeting" action is shown to them, and a direct API delete attempt is rejected as if the meeting didn't exist (404).
- User opens a meeting detail page while its summary is generating (`summaryStatus = PROCESSING`) -> "Refresh Transcription" and "Delete" are disabled for every file on that meeting.
- Summary generation finishes (`summaryStatus` becomes `COMPLETED` or `FAILED`) -> both buttons return to their normal enabled state for each file (still subject to existing per-file transcription-status disabling).

## In scope

- Relocate the "New meeting" control from beside the "Your meetings" section header (`apps/web/src/_pages/home/ui/home-page.tsx`) into the top header row, positioned before "Logout".
- Add a "Delete meeting" capability, available only to the meeting's organizer, reachable from the home page and/or meeting detail page.
- Require an explicit confirmation step before a meeting delete request is sent.
- Add a `DELETE /meetings/:id` API endpoint, organizer-scoped, that removes the meeting and its dependent data (files on disk included).
- Update the home page's meeting lists ("Last three meetings", "Your meetings") to no longer show a deleted meeting.
- Disable the "Refresh Transcription" button for every file on a meeting whenever that meeting's `summaryStatus` is `PROCESSING`.
- Disable the "Delete" (file) button for every file on a meeting whenever that meeting's `summaryStatus` is `PROCESSING`.

## Out of scope

- Bulk deletion of multiple meetings at once.
- Deleting a meeting as anyone other than its organizer (no admin override).
- Soft-delete, trash, or restore/undo of a deleted meeting.
- Changing existing per-file transcription-status disabling logic on "Refresh Transcription".
- Changing summary generation itself (trigger conditions, retry behavior, "Refresh Summary").
- Repositioning or restyling any header element other than "New meeting".

## Technical limitations

- No `DELETE /meetings/:id` endpoint exists today. It must follow the existing organizer-scoped pattern already used by delete-file/refresh-transcription/refresh-summary handlers (`SELECT ... FOR UPDATE WHERE id = ... AND organizerId = ...`), returning 404 — not 403 — for a nonexistent meeting or one the caller doesn't organize, to avoid leaking meeting existence.
- Prisma cascade (`onDelete: Cascade`) already removes dependent `MeetingFile`/action item/decision rows when a `Meeting` row is deleted, but does not remove the corresponding files from disk. The new handler must explicitly clean up on-disk files, the way the existing delete-file handler already does per file.
- The current "New meeting" trigger is a plain `<Link>` styled with raw CSS classes (`button button--primary button--md`), unlike the HeroUI `<Button>` used for "Logout" in the same header. Moving it into the header should not leave two visually inconsistent button styles side by side.
- `delete-meeting-file-button.tsx` currently has no `isDisabled` prop at all; one must be added and threaded down from the parent (mirroring how `RefreshTranscriptionButton` already receives `isDisabled`).
- The disabled state for both file-action buttons depends on the meeting's `summaryStatus` being available wherever the meeting detail page renders/refetches meeting data; this PRD assumes the existing fetch/poll mechanism for meeting status is reused as-is.

## Acceptance Criteria

- [ ] "New meeting" appears in the top header row, before "Logout", visible without scrolling.
- [ ] The "Your meetings" section header no longer has a "New meeting" control next to it.
- [ ] An organizer sees a "Delete" action on meetings they organize.
- [ ] A non-organizer participant does not see a "Delete meeting" action on a meeting they don't organize.
- [ ] A direct API delete request for a meeting the caller doesn't organize (or that doesn't exist) returns 404.
- [ ] Deleting a meeting requires confirming an explicit prompt before the request is sent; canceling leaves the meeting untouched.
- [ ] After confirmed deletion, the meeting and all its files (on disk and in the DB), transcriptions, action items, decisions, and summary are removed.
- [ ] A deleted meeting no longer appears in "Last three meetings" or "Your meetings".
- [ ] While a meeting's `summaryStatus` is `PROCESSING`, "Refresh Transcription" is disabled for every file in that meeting.
- [ ] While a meeting's `summaryStatus` is `PROCESSING`, "Delete" is disabled for every file in that meeting.
- [ ] Once `summaryStatus` leaves `PROCESSING`, both buttons return to their normal enabled state (still respecting existing per-file transcription-status rules).
