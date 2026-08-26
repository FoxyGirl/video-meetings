# Plan: Meeting Summary, Action Items, and Decisions

**PRD:** docs/prd-meeting-summary-action-items-and-decisions.md

**Research:** docs/research-meeting-summary-action-items-and-decisions.md

**Date:** 2026-08-26

## Implementation Phases

### Phase 1-meeting-summary: Automatic Meeting-Level Summary Generation (Backend Core)

**Goal:** Once every file on a meeting has reached a terminal transcription state (`COMPLETED`/`FAILED`) with at least one `COMPLETED`, automatically generate a summary, action items, and decisions via an external LLM API from the combined completed transcripts, persist them, and expose them on the existing meeting read endpoint.

**Affects:** backend, database

**Tasks:**

- [ ] Prisma schema: add a `SummaryStatus` enum (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`), add `summaryStatus`, `summaryText`, `summaryIsPartial`, `summaryUpdatedAt` to `Meeting`, and add `ActionItem` (`id`, `meetingId` FK + `@@index`, `description`, `assignee` nullable, `createdAt`, `updatedAt`) and `Decision` (`id`, `meetingId` FK + `@@index`, `description`, `createdAt`, `updatedAt`) models per `.claude/rules/prisma.md`; run the migration.
- [ ] LLM client integration (`src/meetings/summary/`): install the chosen provider's SDK, wrap the call behind a `generateMeetingSummary(transcriptText)` function returning `{ summary, actionItems: { description, assignee? }[], decisions: string[] }`; parse/validate the response and throw on malformed/unparseable output.
- [ ] "All files terminal" detection: after `TranscribeMeetingFileHandler` writes a terminal status, check whether every sibling `MeetingFile` on the same meeting is now terminal and at least one is `COMPLETED`; if so, dispatch a new `GenerateMeetingSummaryCommand` fire-and-forget (same catch-and-log pattern as existing transcription dispatches).
- [ ] `GenerateMeetingSummaryCommand`/`GenerateMeetingSummaryHandler` (`src/meetings/commands/`): build one combined transcript from the meeting's `COMPLETED` files ordered by `uploadedAt`; write `PENDING`→`PROCESSING`; call the LLM client; on success replace any existing `ActionItem`/`Decision` rows and write `COMPLETED` + `summaryText` + `summaryIsPartial` (true if any sibling file is `FAILED`) + `summaryUpdatedAt`; on any error write `FAILED` (existing summary/items/decisions left untouched, matching the transcription handler's failure behavior).
- [ ] Extend the meeting read response (`GetMeetingHandler`/`GET /meetings/:id`) to include `summaryStatus`, `summaryText`, `summaryIsPartial`, `actionItems[]`, `decisions[]`.
- [ ] e2e tests (written first, `test/meeting-summary-generation.e2e-spec.ts`): auto-generation after all files complete; partial-input case (mixed `COMPLETED`/`FAILED`); all-`FAILED` case (no generation attempted, status reflects "not applicable"); viewing the meeting never re-triggers generation.
- [ ] Unit tests for the LLM response parser: well-formed response, malformed/unparseable response (must surface as a handled failure, not a crash).

**When ready:** Uploading one or more files to a meeting and letting all of them finish transcribing results in `GET /meetings/:id` returning a completed summary, action items, and decisions with no further user action; the new e2e and unit suites pass.

### Phase 2-meeting-summary: Refresh and Invalidation on File Changes (Backend)

**Goal:** Add an explicit "Refresh Summary" endpoint and make every meeting file-set change (upload, replace, delete, transcription refresh) invalidate a stale summary and re-trigger generation once the files resolve again.

**Affects:** backend, database

**Tasks:**

- [ ] `POST /meetings/:id/summary/refresh` (`RefreshMeetingSummaryCommand`/`RefreshMeetingSummaryHandler`): organizer-scoped using the same `SELECT ... FOR UPDATE` lock pattern as other meeting mutations (`404` for non-organizer/nonexistent meeting); discards the existing `summaryText`/`summaryIsPartial`/`ActionItem`/`Decision` rows, resets `summaryStatus`, then re-runs the Phase 1 generation trigger against the meeting's current completed transcripts.
- [ ] Invalidation hooks: `UploadMeetingFileHandler`, `DeleteMeetingFileHandler`, and `RefreshTranscriptionHandler` each clear the meeting's existing summary/action items/decisions (same reset as refresh) when the meeting already has a non-empty summary, then re-run the Phase 1 "all files terminal" check so a fresh generation fires once the file set resolves again.
- [ ] Compare-and-set guard on `GenerateMeetingSummaryHandler`'s writes (analogous to `TranscribeMeetingFileHandler`'s `updateMany` keyed on `id` + `filePath`) so a superseded, still-running generation triggered before a refresh/invalidation can't overwrite the newer run's results.
- [ ] e2e tests (written first, `test/meeting-summary-refresh.e2e-spec.ts`): refresh discards and regenerates an existing summary; uploading/replacing/deleting a file on a meeting with an existing summary invalidates it and a fresh one regenerates once files resolve; a stale in-flight generation never clobbers a newer refresh's results.
- [ ] Unit tests covering the invalidation branch in each of the three file-change handlers (no-op when the meeting has no summary yet; clears + re-checks when it does).

**When ready:** The refresh endpoint works for organizers only; any upload, replace, delete, or transcription refresh on a meeting with an existing summary clears it and a correct new one appears automatically once the meeting's files are again all resolved; the new e2e and unit suites pass.

### Phase 3-meeting-summary: Meeting Detail Page Display (Frontend)

**Goal:** Show the generation status, summary, action items (with assignee when present), and decisions on the meeting detail page, with an organizer-only "Refresh Summary" button, covering every state defined in the PRD.

**Affects:** frontend

**Tasks:**

- [ ] Extend the web API client to read the new `summaryStatus`/`summaryText`/`summaryIsPartial`/`actionItems`/`decisions` fields from `GET /meetings/:id` and to call `POST /meetings/:id/summary/refresh`.
- [ ] Add Summary, Action Items (description + assignee when present), and Decisions sections to the meeting detail page, rendered when `summaryStatus` is `COMPLETED`; an empty action-item or decision list renders as an explicit "none found" state, never fabricated content.
- [ ] Render the non-completed states: Pending/Processing indicator, Failed indicator, and a "not yet available" / "no summary — every file failed transcription" explanatory state, matching the PRD's scenarios.
- [ ] Show a partial-input notice when `summaryIsPartial` is true.
- [ ] Organizer-only "Refresh Summary" button that calls the refresh endpoint and updates the page to the Pending/Processing state.
- [ ] Playwright e2e tests (written first): completed summary renders correctly; refresh button flow; partial-input notice; empty action-item/decision list rendering; not-yet-available state while files are still transcribing; all-failed explanatory state.
- [ ] Manual verification: run the app locally and exercise the golden path (upload → wait for transcription + generation → view results) and the refresh/partial/failure edge cases in the browser, per this repo's UI-change verification requirement.

**When ready:** An organizer or participant viewing a meeting's detail page after processing completes sees the summary, action items, and decisions; an organizer can trigger "Refresh Summary" from the page and see it update; every PRD-listed status/edge-case state renders correctly; the Playwright suite passes and the flow has been manually exercised in the browser.
