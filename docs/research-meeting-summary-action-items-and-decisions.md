# Research: Meeting Summary, Action Items, and Decisions

## Goal

Determine the best implementation approach for `docs/plan-meeting-summary-action-items-and-decisions.md` — meeting-level summary/action-items/decisions generated via an external LLM once all of a meeting's files finish transcribing — by reusing this repo's existing CQRS, per-file-status, invalidation, and frontend polling/status-display patterns rather than inventing new ones.

## Recommended solution

**Backend: mirror `TranscribeMeetingFileHandler`'s trigger/status/compare-and-set shape exactly, one level up (meeting instead of file).**

The transcription feature (`docs/prd-transcribe-uploaded-meeting-files-with-local-whisper.md`, implemented in `apps/api/src/meetings/`) already solves the same category of problem this feature needs solved again: fire-and-forget background work after a mutation, a status enum with `PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`, an organizer-only refresh endpoint, and invalidation-on-file-change. Reuse the same shapes:

- Add `SummaryStatus` (same four values as `TranscriptionStatus`) and `summaryStatus`/`summaryText`/`summaryIsPartial`/`summaryUpdatedAt` directly on `Meeting` (not a side table) — a meeting has exactly one summary, unlike the one-to-many `MeetingFile` relation, so this is a 1:1 fit for flat columns, the same way `Meeting` held file/transcription state before the multi-file phase moved it out (`apps/api/CLAUDE.md`'s "Meetings" section, "File/transcription state used to live directly on `Meeting`..."). `ActionItem` and `Decision` become their own one-to-many models off `Meeting` (`meetingId` FK, `onDelete: Cascade`, `@@index`), matching `.claude/rules/prisma.md` and mirroring `MeetingFile`'s own relation shape.
- **Trigger detection**: add a small helper, e.g. `maybeTriggerMeetingSummary(meetingId)` (`src/meetings/summary/`), called from the same three places transcription state changes today: the end of `TranscribeMeetingFileHandler`'s try/catch (after every terminal write, success or failure), and the equivalent point in `RefreshTranscriptionHandler`. It re-reads all of the meeting's `MeetingFile` rows, and if every one is terminal (`COMPLETED`/`FAILED`) and at least one is `COMPLETED`, dispatches `GenerateMeetingSummaryCommand` fire-and-forget — same `.catch()`-logged, non-awaited dispatch style `UploadMeetingFileHandler`/`RefreshTranscriptionHandler` already use for `TranscribeMeetingFileCommand`.
- **`GenerateMeetingSummaryCommand`/`GenerateMeetingSummaryHandler`** (`src/meetings/commands/`): re-reads the meeting's `COMPLETED` files ordered by `uploadedAt`, joins their `transcriptionText` into one input, writes `PROCESSING` via the same `updateMany`-as-compare-and-set pattern `TranscribeMeetingFileHandler` uses (keyed on meeting `id` + a guard value — see "Risks" below for what that guard needs to be, since a meeting has no `filePath`-equivalent natural version stamp), calls the LLM, and on success replaces `ActionItem`/`Decision` rows (delete-then-create inside one transaction, or `deleteMany` + `createMany`) and writes `COMPLETED` + `summaryText` + `summaryIsPartial` (true if any sibling file is `FAILED`) + `summaryUpdatedAt`; on any error, `FAILED`.
- **Refresh endpoint** (`POST /meetings/:id/summary/refresh`): same organizer-scoped `SELECT ... FOR UPDATE`-locked transaction shape as `RefreshTranscriptionHandler` — clear existing summary/action items/decisions inside the lock, then the same two-step "commit, then PENDING-write, then fire-and-forget dispatch" tail `RefreshTranscriptionHandler` uses.
- **Invalidation on file change**: `UploadMeetingFileHandler`, `DeleteMeetingFileHandler`, and `RefreshTranscriptionHandler` each need one added step — clear the meeting's existing summary/action items/decisions (only if `summaryStatus` isn't already null, to avoid a needless write on a meeting that never had one), then call the same `maybeTriggerMeetingSummary` helper the transcription-completion path uses. This keeps "does the file set look finished, and does it warrant a (re)generation" as one piece of logic, not duplicated per caller.
- **Response shape**: extend `GetMeetingHandler`'s return value with `summaryStatus`/`summaryText`/`summaryIsPartial`/`actionItems`/`decisions`, the same way `flattenMeetingFile` already extends the base `Meeting` row today — either grow `flattenMeetingFile` to include these fields (they now live on `Meeting` directly, unlike file fields) or add them alongside it in `GetMeetingHandler`. `GetMeetingsHandler` (the list endpoint) can stay untouched unless a future need arises — the PRD only requires display on the meeting **detail** page.

**LLM call: reuse `@anthropic-ai/claude-agent-sdk`, already a dependency, via its `outputFormat: { type: 'json_schema' }` option — do not add a second LLM SDK.**

`apps/api/package.json` already depends on `@anthropic-ai/claude-agent-sdk` (added in `30c1b50 chore(Agent SDK): add dependencies for Agent SDK and implement e2e test for checking Agent SDK response`), and `apps/api/test/agent-sdk.e2e-spec.ts` already establishes the exact pattern this feature needs:

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: '...',
  options: { maxTurns: 1, allowedTools: [] },
})) {
  if (message.type !== 'result') continue;
  // message.subtype === 'success' -> message.result
}
```

- It's gated by `ANTHROPIC_API_KEY` being present (`describeIfApiKeyPresent`), the same opt-in-by-env-var convention `TRANSCRIPTION_ENABLED` already uses for Whisper — the natural precedent for this feature's own generation-enabled check.
- The SDK's type defs (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`) expose `options.outputFormat?: { type: 'json_schema'; jsonSchema: Record<string, unknown> }` on the query options — this lets the summary/action-items/decisions extraction ask for a JSON Schema-validated response directly, rather than hand-parsing free text out of `message.result`. This directly addresses the PRD's "LLM output is not guaranteed structured/parseable" technical limitation: define one JSON Schema (`{ summary: string, actionItems: { description: string, assignee?: string }[], decisions: string[] }`) and pass it as `outputFormat`; a response that still fails to validate/parse is treated as a handled `FAILED`, same as any other caught error in the handler.
- The SDK bundles a platform-specific CLI binary as its own dependency (`@anthropic-ai/claude-agent-sdk-linux-x64`, present in `node_modules` with a `claude` binary) — confirmed already installed via `npm install` today, no extra toolchain step like Whisper's CMake build.
- `maxTurns: 1, allowedTools: []` (as the existing e2e test already sets) keeps each call a single-shot, non-agentic request — appropriate for a pure text-in/JSON-out extraction task, and keeps cost/latency bounded per meeting.

This is preferred over adding `@anthropic-ai/sdk` (the plain Messages API client): the repo has already made the deliberate choice to bring in the Agent SDK rather than the plain API client, and it already covers this use case (single-turn, tool-free, schema-constrained JSON output) without needing a second LLM dependency alongside it. See "Risks" for the one open question this choice raises.

**Frontend: a new `MeetingSummary` component, structurally mirroring `MeetingTranscription`.**

- Mount it once per meeting (not once per file, unlike `MeetingTranscription`) on `/meetings/[id]` (`apps/web/src/app/meetings/[id]/page.tsx`), seeded from the fields `GET /meetings/:id` now returns (the page already fetches the meeting itself, no extra request needed for the seed).
- Reuse the same building blocks `MeetingTranscription` already established: a `Chip`-based status indicator (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`, plus a distinct "not yet available" / "no completed files" state this feature adds that transcription's per-file status never needed), a polling `useEffect` bounded to `PENDING`/`PROCESSING` that re-fetches the meeting (or a lighter summary-only endpoint, see "Open questions") on an interval and stops once terminal, a `Disclosure` or plain block for the summary text, and an organizer-only "Refresh Summary" button following `refreshTranscription`'s exact request/response-trust pattern (reflect the response's real status, never assume `PENDING` locally, since the refresh can legitimately no-op server-side).
- Action items and decisions render as two plain lists (each item's `description`, action items additionally showing `assignee` when non-null) — no existing list-rendering component to reuse beyond basic HeroUI primitives already used elsewhere (`Card`, `Chip`, `Alert`).
- `api.ts` needs two additions: extending whatever `getMeeting`/meeting-fetching call already exists to type the new fields, and a `refreshMeetingSummary(meetingId)` wrapping `POST /meetings/:id/summary/refresh`, mirroring `refreshTranscription`'s shape exactly.

## Reusable code

- `apps/api/src/meetings/commands/handlers/transcribe-meeting-file.handler.ts` — the compare-and-set (`updateMany` keyed on an identity + version guard) pattern for a long-running background job whose result can be superseded mid-flight; the direct template for `GenerateMeetingSummaryHandler`.
- `apps/api/src/meetings/commands/handlers/refresh-transcription.handler.ts` — the organizer-locked-transaction-then-fire-and-forget-dispatch shape for `RefreshMeetingSummaryHandler`; also the "trust the re-read response, not a locally-assumed status" convention the frontend must follow too.
- `apps/api/src/meetings/commands/handlers/upload-meeting-file.handler.ts` and `delete-meeting-file.handler.ts` — where the new invalidation-on-file-change step gets added, and the existing `SELECT ... FOR UPDATE` lock these already take (no new locking primitive needed).
- `apps/api/src/meetings/transcription/whisper.constants.ts`'s `isTranscriptionEnabled()` — the exact template for a `isSummaryGenerationEnabled()` (or reuse of `ANTHROPIC_API_KEY`-presence check) gating this feature the same opt-in way, and for e2e tests to disable it the same way `.env.test` disables transcription.
- `apps/api/test/agent-sdk.e2e-spec.ts` — the established, gated (`describeIfApiKeyPresent`) pattern for exercising a real LLM call in this codebase; `GenerateMeetingSummaryHandler`'s own e2e coverage should follow the same gating so the suite stays green without a real API key.
- `apps/api/src/meetings/meeting-file.types.ts`'s `toMeetingFileMetadata` — the precedent for a small, explicit response-shaping function rather than returning raw Prisma rows; do the same for action items/decisions if their raw Prisma shape needs trimming before going over HTTP (unlikely to need much trimming here, but keep the convention in mind).
- `apps/web/src/components/meeting-transcription.tsx` — the direct structural template for the new `MeetingSummary` component (status chip, bounded polling, organizer-only refresh button with response-trusting state update, `Disclosure` for long text, distinct `Alert`s for different failure kinds).
- `apps/web/src/lib/api.ts`'s `refreshTranscription`/`listMeetingFiles` — the template for the two new client functions this feature needs.

## Risks

- **What compare-and-set guard protects `GenerateMeetingSummaryHandler`'s writes?** `TranscribeMeetingFileHandler` keys its `updateMany` on `{ id: fileId, filePath }` — `filePath` acts as a cheap "this is still the same underlying file" version stamp. A `Meeting` has no equivalent natural stamp (its `id` never changes). Without one, a superseded generation run (e.g. triggered before a refresh or a file-set change lands) could overwrite a newer run's result. The plan's Phase 2 already calls this out; the concrete fix is likely to key the guard on `summaryStatus` itself (`updateMany({ where: { id: meetingId, summaryStatus: 'PROCESSING' } })`) combined with each run stamping a fresh value it alone claimed — needs to be nailed down during Phase 1/2 implementation, not left implicit.
- **Claude Agent SDK is heavier-weight than a plain API client.** `query()` drives an actual CLI subprocess (the bundled `claude` binary), not a lightweight HTTP call — this is more process/latency overhead per meeting-summary generation than a direct Messages API call would be, and ties this feature's reliability to the Agent SDK's subprocess-spawning behavior working correctly in whatever server environment `apps/api` deploys to (unverified beyond local `node_modules` today). If this turns out to be a real problem in practice (e.g. subprocess spawning restricted in some deployment target), falling back to `@anthropic-ai/sdk`'s plain Messages API with a manually-parsed/validated JSON response is the fallback, at the cost of a second LLM dependency.
- **Long combined transcripts may exceed context window** (flagged already in the PRD's technical limitations) — no chunking strategy is designed here; `GenerateMeetingSummaryHandler`'s catch-all error handling turns an API-side "too long" rejection into `FAILED`, which is spec-compliant but not a graceful degradation. Acceptable for this iteration per the PRD's own scope.
- **Fan-in race between multiple files finishing near-simultaneously.** If two files' transcription jobs both reach their terminal write at nearly the same time, both could independently observe "all files terminal" and each dispatch `GenerateMeetingSummaryCommand`. The compare-and-set write in `GenerateMeetingSummaryHandler` (once designed per the point above) needs to make a double-dispatch harmless (second one no-ops), the same way `TranscribeMeetingFileHandler`'s guard already makes redundant/late writes harmless.

## Open questions

- Should the frontend's polling re-fetch the whole meeting (`GET /meetings/:id`, heavier, but no new endpoint) or would a lighter dedicated summary-status endpoint be worth adding? `MeetingTranscription` already re-fetches via `listMeetingFiles` (a list, not a single-field poll) for the same tradeoff, so reusing `GET /meetings/:id` for the summary poll is consistent with that precedent unless payload size becomes a real concern.
- Exact LLM prompt/schema wording (system prompt, JSON Schema field descriptions, how "no clear items" is asked for so the model returns empty arrays rather than inventing content) is a Phase 1 implementation detail, not resolved here — flagged in the PRD as "extraction must not invent items."
- Whether `isSummaryGenerationEnabled()` should reuse `ANTHROPIC_API_KEY`'s mere presence (like the Agent SDK e2e test does) or introduce its own explicit toggle (like `TRANSCRIPTION_ENABLED`) for finer-grained control (e.g. temporarily disabling summary generation without unsetting the API key entirely) — either is consistent with existing conventions; Phase 1 should pick one.

## References

- `apps/api/prisma/schema.prisma` — current `Meeting`/`MeetingFile`/`TranscriptionStatus` shape.
- `apps/api/src/meetings/commands/handlers/transcribe-meeting-file.handler.ts`, `refresh-transcription.handler.ts`, `upload-meeting-file.handler.ts`, `delete-meeting-file.handler.ts`.
- `apps/api/src/meetings/queries/handlers/get-meeting.handler.ts`, `apps/api/src/meetings/meeting-file-flatten.util.ts`, `apps/api/src/meetings/meeting-file.types.ts`.
- `apps/api/src/meetings/transcription/whisper.constants.ts`, `apps/api/src/meetings/meetings.controller.ts`.
- `apps/api/test/agent-sdk.e2e-spec.ts`, `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (`outputFormat`/`json_schema` option), `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/`.
- `apps/web/src/components/meeting-transcription.tsx`, `meeting-file-display.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/app/meetings/[id]/page.tsx`.
- `apps/api/CLAUDE.md` ("Meetings" / "Transcription" sections), `apps/web/CLAUDE.md` ("Meeting transcription status and transcript" section), `.claude/rules/prisma.md`.
- `docs/prd-meeting-summary-action-items-and-decisions.md`, `docs/plan-meeting-summary-action-items-and-decisions.md`, `docs/prd-transcribe-uploaded-meeting-files-with-local-whisper.md`.
