# PRD: Local Whisper Transcription for Uploaded Meeting Files

**Date**: 2026-08-20
**Status**: Draft

## Purpose

Meeting organizers upload an MP4/MP3 recording to a meeting (existing feature) but currently have no way to read what was said without watching or listening to the whole file. Automatically transcribing the uploaded file with a local Whisper model gives organizers a searchable, readable record of the meeting without sending audio/video to a third-party API.

## User Scenarios

- Organizer uploads an MP4 or MP3 file to a meeting -> Transcription starts automatically in the background; the meeting page shows a "Pending"/"Processing" status.
- Organizer opens the meeting detail page while transcription is still running -> The current status is shown (not the transcript text), without re-triggering transcription.
- Organizer opens the meeting detail page after transcription finished -> The saved transcript is shown immediately, read from the database; transcription is not re-run.
- Transcription fails (e.g. corrupt file, process crash) -> The meeting page shows a "Failed" status and lets the organizer retry via "Refresh Transcription".
- Organizer clicks "Refresh Transcription" -> The existing transcript (if any) is discarded, status resets to "Pending"/"Processing", and the file is transcribed again from scratch.
- Organizer replaces the meeting's file (re-upload) -> The previous transcript and status no longer apply to the new file; transcription starts automatically for the new file, same as a first upload.
- Organizer deletes the meeting's file -> Any transcript and transcription status for that file are removed along with it.

## In scope

- Server-side transcription of a meeting's uploaded file using Whisper's **tiny** model, run **locally** (no external/cloud transcription API).
- Supported inputs: the file types already accepted by meeting file upload that are audio or video containing speech — `.mp4`, `.mp3` (per the request); support may extend to the other already-accepted types (`.webm`, `.mov`, `.wav`, `.m4a`, `.ogg`) if trivial given the chosen local Whisper integration, but MP4/MP3 are the required minimum.
- Automatic trigger: transcription starts as soon as a file finishes uploading to a meeting, with no separate user action required.
- A transcription status field, persisted per meeting, with at minimum these states: **Pending**, **Processing**, **Completed**, **Failed**. Shown on the meeting detail page.
- On completion, the transcript text is saved to the database, associated with the meeting's current file.
- Opening/viewing a meeting reads the stored status and transcript (if any) from the database. It never triggers a new transcription run as a side effect of viewing.
- A "Refresh Transcription" action (button) on the meeting detail page, visible to the meeting organizer, that discards the current transcript/status and re-runs transcription on the currently-uploaded file.
- Re-uploading a new file for a meeting invalidates any prior transcript/status for that meeting and triggers a fresh automatic transcription of the new file (same rule as first upload).
- Deleting a meeting's file removes its associated transcript and status.
- Displaying the completed transcript as plain text on the meeting detail page.
- Basic failure handling: if transcription errors out, status becomes Failed and the organizer can recover only via "Refresh Transcription" (no silent retries).

## Out of scope

- Cloud/third-party transcription APIs (e.g. OpenAI's hosted Whisper API) — local inference only, per requirement.
- Any Whisper model other than "tiny" (no model-size selection, no accuracy/quality tier options).
- Speaker diarization ("who said what").
- Word- or segment-level timestamps, subtitle/caption file export (e.g. `.srt`/`.vtt`).
- Translation to a different language than the one spoken (transcription only, in the source language).
- Editing the transcript text after generation.
- Searching across transcripts, or search within a transcript's text.
- Re-transcribing automatically on a schedule or on any trigger other than upload, re-upload, or the explicit "Refresh Transcription" click.
- Real-time/live transcription during a meeting — this feature only processes already-uploaded recordings.
- Notifying the organizer (email/push) when transcription completes; status is only visible by viewing the meeting page.
- Concurrency/queueing guarantees for many simultaneous transcription jobs across meetings (single-server, best-effort processing is acceptable for this iteration).

## Technical limitations

- The API currently has no background job/queue infrastructure (no BullMQ, no cron, no async worker — only in-process, synchronous NestJS CQRS command/query handlers). Running Whisper transcription (a CPU/time-intensive task, even on the tiny model) without blocking the HTTP request/response cycle requires introducing an asynchronous execution mechanism; this PRD does not prescribe which one.
- No local Whisper/ASR package or binary is installed in the project today; the chosen local runtime (e.g. a Node binding, a bundled binary, or a subprocess) must be introduced and must run without network access at inference time.
- There is currently only one file per meeting, stored on local disk with a server-generated filename (`Meeting.filePath` and related columns on the `Meeting` model in `apps/api/prisma/schema.prisma`). There is no separate file/version model, so transcription state must key off the meeting's single current file and be invalidated whenever that file is replaced or removed.
- The Prisma schema has no existing `enum` types; a transcription status enum is a new schema addition, along with columns/fields to hold the status and transcript text (or a related model), and a migration.
- Whisper's tiny model has materially lower accuracy than larger models, especially on accented speech, overlapping speakers, or noisy audio — transcript quality is a known, accepted limitation of using "tiny" specifically for local/performance reasons.
- Local inference speed depends on the host machine's CPU (no GPU assumed); transcription of longer recordings may take a nontrivial amount of wall-clock time, during which the meeting shows "Processing".

## Acceptance Criteria

- [ ] Uploading an `.mp4` or `.mp3` file to a meeting automatically starts transcription without any additional user action.
- [ ] The meeting detail page displays the current transcription status (Pending, Processing, Completed, or Failed) at all times a file is present.
- [ ] When transcription completes successfully, the transcript text is persisted in the database and displayed on the meeting detail page.
- [ ] Reloading or reopening a meeting whose transcription already completed shows the saved transcript immediately, without re-running transcription.
- [ ] A "Refresh Transcription" button is visible on the meeting detail page and, when clicked, discards the existing transcript/status and re-transcribes the meeting's current file.
- [ ] Transcription only re-runs automatically when: (a) a file is uploaded for the first time, or (b) the meeting's file is replaced with a new upload. Simply viewing the meeting page never re-runs it.
- [ ] If transcription fails, the status shown is Failed, and clicking "Refresh Transcription" is the way to retry.
- [ ] Deleting a meeting's uploaded file also removes its associated transcript and status.
- [ ] Transcription runs using a locally-executed Whisper "tiny" model — no audio/video or transcript text is sent to an external transcription service.
