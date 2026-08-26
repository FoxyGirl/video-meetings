# PRD: Meeting Summary, Action Items, and Decisions

**Date**: 2026-08-26
**Status**: Draft

## Purpose

Once a meeting's uploaded recordings have been transcribed, organizers and participants still have to read the raw transcript to find out what was actually decided and who owes what. Automatically generating a summary, an assignable action-item list, and a decisions list from the completed transcript(s) — and showing them on the meeting page — turns a wall of transcript text into something people can act on at a glance.

## User Scenarios

- All of a meeting's uploaded files finish transcribing (status `COMPLETED`) -> Their transcripts are combined and sent for analysis; the meeting page shows a "Pending"/"Processing" status for the summary while it runs.
- A meeting has multiple files and at least one is still `PENDING`/`PROCESSING` -> No summary/action items/decisions are generated yet; nothing is shown for this feature except a "not yet available" state.
- A meeting has multiple files and one or more finished with `FAILED` transcription while the rest `COMPLETED` -> Summary generation proceeds using only the successfully transcribed files' text; the meeting page indicates that one or more files could not be included.
- Every one of a meeting's files ends in `FAILED` (none `COMPLETED`) -> There is no transcript text to work with; summary/action items/decisions are not generated, and the page explains why.
- Organizer or participant opens the meeting detail page after generation finished -> The saved summary, action items (each with an assignee when the transcript names one), and decisions are shown immediately, read from the database; generation is not re-run.
- Organizer opens the meeting detail page while generation is still running -> The current status is shown, without re-triggering generation.
- Generation fails (e.g. API error, timeout) -> The meeting page shows a "Failed" status for this feature and lets the organizer retry via a "Refresh Summary" action.
- Organizer clicks "Refresh Summary" -> The existing summary/action items/decisions are discarded, status resets to "Pending"/"Processing", and generation runs again from the meeting's current set of completed transcripts.
- Organizer uploads an additional file, re-uploads/replaces a file, or deletes a file after a summary already exists -> The existing summary/action items/decisions no longer reflect the meeting's current files, so they are invalidated; a fresh generation run is triggered once the meeting's files are again all resolved (`COMPLETED` or `FAILED`, at least one `COMPLETED`).
- A meeting's transcript(s) mention no clear to-do items, or no clear decisions -> The corresponding list is shown empty rather than fabricated ("if this is in the meeting" — extraction must not invent items that aren't supported by the transcript).

## In scope

- Server-side generation of three artifacts per meeting, derived from the combined transcript text of all of that meeting's files with `transcriptionStatus: COMPLETED`:
  - A **summary**: a short prose overview of what the meeting covered.
  - A **list of action items**: each with a description and, when the transcript identifies one, a responsible person (name/identifier as mentioned in the transcript — not resolved against `User`/participant records).
  - A **list of decisions**: distinct from action items, capturing conclusions/decisions reached in the meeting.
- Using an external LLM API to perform the summarization and extraction, given transcript text as input.
- Automatic trigger: generation starts once every one of the meeting's uploaded files has reached a terminal transcription state (`COMPLETED` or `FAILED`) and at least one file is `COMPLETED`, with no separate user action required.
- A generation status field, persisted per meeting, with at minimum: **Pending**, **Processing**, **Completed**, **Failed**, and a state representing "not yet applicable" (files still transcribing, or none completed). Shown on the meeting detail page.
- If generation runs with only a subset of the meeting's files (because one or more failed transcription), the meeting page indicates that the summary/action items/decisions are based on partial input.
- On completion, the summary text, action items (with description and optional assignee), and decisions are saved to the database, associated with the meeting.
- Opening/viewing a meeting reads the stored status, summary, action items, and decisions from the database. It never triggers a new generation run as a side effect of viewing.
- A "Refresh Summary" action (button) on the meeting detail page, visible to the meeting organizer, that discards the current summary/action items/decisions/status and re-runs generation using the meeting's current completed transcripts.
- Any change to the meeting's set of files (new upload, re-upload/replace, delete, or a transcription refresh that changes a file's transcript) invalidates the existing summary/action items/decisions for that meeting; a fresh automatic generation run is triggered once the files are again all in a terminal transcription state with at least one completed.
- Displaying the summary, action items (with assignee when present), and decisions on the meeting detail page, each as its own distinct section.
- Basic failure handling: if generation errors out, status becomes Failed and the organizer can recover only via "Refresh Summary" (no silent retries).

## Out of scope

- Generating a summary/action items/decisions per individual file — this iteration is meeting-level only, combining all of a meeting's completed transcripts into one set of results.
- Assigning action items to actual `User` accounts or meeting participants, or notifying an assignee — the assignee is stored as free text exactly as identified from the transcript, with no linkage to the `User`/participant data model.
- Editing the generated summary, action items, or decisions after generation (no manual correction UI).
- Marking action items as done/tracking their completion status over time.
- Due dates, priority, or any other metadata on action items beyond description and assignee.
- Search across summaries/action items/decisions, or across multiple meetings' results.
- Re-generating automatically on a schedule or on any trigger other than the ones listed above (file set change or explicit "Refresh Summary" click).
- Notifying the organizer (email/push) when generation completes; status is only visible by viewing the meeting page.
- Concurrency/queueing guarantees for many simultaneous generation jobs across meetings (single-server, best-effort processing is acceptable for this iteration, matching the existing transcription feature).
- Choosing/configuring which external LLM provider or model is used — that is an implementation decision, not a product requirement of this PRD.

## Technical limitations

- This feature depends on the existing per-file transcription feature (`docs/prd-transcribe-uploaded-meeting-files-with-local-whisper.md`) and its `MeetingFile.transcriptionStatus`/`transcriptionText` columns; it does not change how individual files are transcribed.
- A meeting has no existing "all files done" signal today — `TranscribeMeetingFileHandler` and `RefreshTranscriptionHandler` each operate on one file in isolation and have no notion of a meeting-level completion event. Detecting "every file is now terminal" requires new logic (e.g. checking sibling file statuses after each per-file transcription write completes).
- The API has no background job/queue infrastructure (see the transcription PRD's equivalent note) — running an external LLM call without blocking the HTTP request/response cycle needs the same kind of asynchronous execution mechanism already introduced for transcription; this PRD does not prescribe whether it reuses that mechanism or introduces another.
- No LLM API client/SDK is installed in the project today; credentials/API key management for the chosen provider is a new operational concern (env var, secrets handling) that doesn't exist elsewhere in this codebase yet.
- Sending transcript text to an external API is a deliberate scope decision for this feature (unlike Whisper transcription, which is local-only) — transcript text, which may include participant names and meeting content, will leave the server. This is an accepted tradeoff per this PRD, not an oversight.
- There is no existing schema for storing structured, multi-item results (a list of action items, a list of decisions) against a `Meeting` — the current schema only stores flat text/status per file. New tables/columns and a migration are required (e.g. a summary text + status on `Meeting`, plus related tables for action items and decisions, each with the fields Prisma conventions require per `.claude/rules/prisma.md`).
- Combining multiple files' transcripts into one input needs a defined ordering/joining approach (e.g. by `uploadedAt`) so results are reproducible between runs on the same underlying transcripts.
- LLM output is not guaranteed structured/parseable on every call; the generation path needs to handle a malformed or unparseable response as a failure (status `FAILED`), not crash or silently store partial/garbage data.
- Very long combined transcripts (many long files) may exceed the chosen LLM's context window; this PRD does not prescribe a chunking/summarization-of-summaries strategy, but implementation must handle the case rather than fail unpredictably.

## Acceptance Criteria

- [ ] Once every file on a meeting has reached a terminal transcription state (`COMPLETED` or `FAILED`) with at least one `COMPLETED`, summary/action-item/decision generation starts automatically without any additional user action.
- [ ] The meeting detail page displays the current generation status (not-yet-applicable, Pending, Processing, Completed, or Failed) at all times.
- [ ] When generation completes successfully, the summary, action items (each with a description and, when identifiable, an assignee), and decisions are persisted in the database and displayed on the meeting detail page as distinct sections.
- [ ] If some but not all files failed transcription, the generated results are based only on the successfully transcribed files, and the meeting page indicates the results are based on partial input.
- [ ] If every file failed transcription, no generation is attempted and the meeting page explains that no summary is available.
- [ ] Reloading or reopening a meeting whose generation already completed shows the saved summary/action items/decisions immediately, without re-running generation.
- [ ] A "Refresh Summary" button is visible on the meeting detail page and, when clicked, discards the existing summary/action items/decisions/status and re-runs generation against the meeting's current completed transcripts.
- [ ] Uploading a new file, replacing a file, or deleting a file on a meeting that already has a summary invalidates the existing summary/action items/decisions, and a fresh generation run is triggered automatically once the meeting's files are again all terminal with at least one completed.
- [ ] Simply viewing the meeting page never re-runs generation.
- [ ] If generation fails, the status shown is Failed, and clicking "Refresh Summary" is the way to retry.
- [ ] An action item or decision list with no qualifying items is shown as an empty list, never fabricated content.
