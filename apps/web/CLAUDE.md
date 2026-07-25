# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the `web` app in the `video-meetings` npm workspaces monorepo (see `../../CLAUDE.md` for the repo-wide picture). It's a Next.js App Router project scaffolded with `create-next-app` (TypeScript, Tailwind CSS v4, ESLint, `src/` directory, `@/*` import alias to `src/*`).

## Commands

Run from this directory, or from the repo root with `--workspace=web`:

```bash
npm run dev             # next dev (Turbopack), http://localhost:3000
npm run build           # next build (production build)
npm run start           # next start (serve the production build)
npm run lint            # eslint (flat config, no path args — lints the whole project)
npm run typecheck       # tsc --noEmit
```

```bash
npm run test:e2e        # playwright test — e2e/*.spec.ts against the real dev stack
```

There is no unit test script/framework configured for this app yet.

## E2E tests (Playwright)

`e2e/*.spec.ts` (config: `playwright.config.ts`, `baseURL` defaults to `http://localhost:3000`) exercise the app through a real browser against the real dev stack — no mocks. This suite is wired into the repo's **pre-push** git hook (`../../CLAUDE.md`'s "Git hooks" section) via the root `npm run test:e2e`, so it runs on every `git push`, not just on demand. `playwright.config.ts`'s `webServer` array auto-starts the `web` (`npm run dev`) and `api` (`npm run dev:api`, run from the repo root) dev servers if they aren't already up, and tears them down afterward — reusing them instead if you already have `npm run dev` running. The one thing that isn't auto-started is Postgres: the container (`docker compose up -d db`, see `../../CLAUDE.md`) must already be running, or both the api dev server's boot and the suite itself will fail/time out. Tests provision their own data over HTTP directly against the API (`API_URL`, defaults to `http://localhost:3001`) — e.g. `meeting-detail.spec.ts` registers/logs in the shared local test user (`qa-test@video-meetings.local`, see `../../CLAUDE.md`'s "Local test user" section) and creates a uniquely-titled meeting per run via `POST /meetings`, rather than depending on hand-seeded state, so the suite is safe to re-run. `npx playwright install chromium` is needed once after installing dependencies to fetch the browser binary (not committed, not an npm dependency).

- `api-helpers.ts` centralizes the shared setup/teardown used across spec files: `registerUserViaApi`/`loginUserViaApi` (direct HTTP calls to the API, bypassing the UI for test data setup), plus `deleteUserByEmail` and `deleteMeetingById`, which delete rows directly from Postgres (via the `pg` devDependency, `DATABASE_URL` env var, default `postgresql://postgres:postgres@localhost:5432/video_meetings` — same default as `apps/api`'s `.env.example`). There's no delete-user API endpoint to call instead — this mirrors how `apps/api`'s own e2e suite cleans up the `User` table by talking to Postgres directly rather than through HTTP. This cleanup matters more now that the suite runs on every push, not just occasionally.
- `register.spec.ts` registers its own throwaway users (unique, timestamped emails) and deletes each one in a `test.afterEach` so repeated runs don't pile up rows in the dev `User` table.
- `meeting-detail.spec.ts` seeds the shared local test user plus a per-run meeting in `beforeAll`, deleting that meeting in `afterAll` — it can't rely on `Meeting`'s cascade-delete-with-organizer, since the shared test user itself is never deleted. It also registers a throwaway second "viewer" user (cleaned up the same way as `register.spec.ts`) to assert the organizer badge is hidden for non-organizers.
- `meeting-file-upload.spec.ts` creates a fresh meeting per test (via the shared test user, deleted in `afterEach`) rather than sharing one meeting across tests like `meeting-detail.spec.ts` does — uploading mutates the meeting's file state, and the suite's default parallelism means a shared meeting could let one test's upload leak into another's "no file yet" expectation. Committed fixtures under `e2e/fixtures/` (`test-recording.mp3`, `invalid-file.txt`) drive the valid-upload and invalid-type cases — file _content_ doesn't need to be real audio/video since validation (both client- and server-side) only checks extension and declared MIME type, never content.

## Architecture

- App Router lives under `src/app`. `layout.tsx` is the root layout, `page.tsx` the home route, `globals.css` the Tailwind entry point.
- `tsconfig.json` extends the repo's `../../tsconfig.base.json` and adds Next-specific compiler options (`bundler` module resolution, `jsx: react-jsx`, the `next` TS plugin, and the `.next/types` includes) — don't remove the `extends` when regenerating this file.
- `eslint.config.mjs` composes `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`, then `eslint-config-prettier` to disable any rules that conflict with the repo's shared Prettier config (`../../.prettierrc`). There is no local `.prettierrc` — formatting is controlled entirely from the repo root.
- Styling is Tailwind CSS v4 via `@tailwindcss/postcss` (see `postcss.config.mjs`); there's no `tailwind.config.*` file since v4 configures via CSS (`globals.css`) rather than a JS config.

## HTTP client (`src/lib/http.ts`, `src/lib/api.ts`)

All API calls go through `axios` (not `fetch`) via a single shared instance, `http` in `src/lib/http.ts`: `axios.create({ baseURL: API_URL })` plus a request interceptor that reads `getAuthSnapshot()` (`auth-store.ts`'s synchronous, non-React accessor) and attaches `Authorization: Bearer <token>` when a session exists. Call sites in `api.ts` (and anything built on it) never thread `accessToken` through function parameters or `useAuth()` — the interceptor attaches it uniformly.

- `api.ts` wraps every call in `try`/`catch` and funnels errors through a shared `toApiError(error, statusMessages?)` helper, since Axios rejects on any non-2xx response (unlike `fetch`, which only sets `res.ok`). `statusMessages` lets a call override the server's raw message with a friendlier one for specific statuses (e.g. 409 on register, 401 on login); when no override matches, the server's own `message` field is surfaced (e.g. the upload endpoint's specific per-case validation messages), falling back to a generic string only for truly unexpected shapes.
- `getMeetingFile(id)` treats a 404 as "no file yet" (resolves `null`) rather than throwing, since by the time it's called the meeting's own existence has already been confirmed via `getMeeting`.
- `uploadMeetingFile(id, file, onProgress?)` posts a `FormData` (field name `file`, matching the API's `FileInterceptor('file', ...)`) and threads an optional `onProgress` callback through Axios's `onUploadProgress` — real byte-level progress since Axios's browser build uses `XMLHttpRequest` under the hood, not a hand-rolled estimate. Never set `Content-Type` manually on this call — the browser needs to set its own multipart boundary.

## Meeting file upload UI (`src/components/meeting-file-upload.tsx`, `src/lib/file-types.ts`)

On `/meetings/[id]`, once the meeting loads, the page fetches `GET /meetings/:id/file` and renders `MeetingFileUpload` only when the viewer is the organizer and no file exists yet (`meetingFile === null` after that fetch resolves). A successful upload calls the `onUploaded` prop back up to the page (`setMeetingFile`), which un-renders the control — the page doesn't otherwise re-fetch. Non-organizers and meetings that already have a file get no upload UI at all; rendering the file's own metadata/download/delete actions is Phase 6's job, not this page's upload path.

- `file-types.ts` holds `ACCEPTED_FILE_TYPES` (extension → MIME) and `MAX_UPLOAD_FILE_SIZE_BYTES`, hand-mirrored from `apps/api/src/meetings/upload/file-upload.constants.ts` — the two apps don't share code, so keep both copies identical if either changes. `validateFile(file)` checks extension, MIME (only if the browser reported one — it can be empty for some formats), and size, purely as a UX fast-fail; the server remains the authority.
- The upload flow itself always re-validates on file selection (not only on submit), shows a `ProgressBar` driven by real upload progress, and surfaces either the client validation error, the server's own rejection message (400s), a size-specific message for 413 (Nest's default body is just "File too large" with no number), or a generic failure message — each in its own `Alert`. A 401 anywhere in this flow calls back up to the page's `onSessionExpired` (same logout-and-redirect the page's own meeting/file fetches use) rather than rendering an error inline.

## Remaining: file metadata, download, and delete UI (Phase 6)

Phase 5 (upload) has shipped; Phase 6 — rendering a file's metadata/download action for any viewer and a delete action for the organizer (`../../docs/plan-meeting-file-upload-storage-and-display.md`) — has not. Read `../../docs/research-meeting-file-upload-storage-and-display.md`'s "Phase 5–6 (frontend)" section first — its download-specific guidance (the blob + object-URL pattern for an authenticated download, since a plain `<a href>` can't carry the Bearer header) is still relevant even though the upload/Axios-migration guidance it also covers has already been implemented. Remove this note once Phase 6 ships.

## UI changes must be visually tested

Any change that affects the UI (component markup, styling, layout, theming, interactive behavior) must be visually verified before the task is considered complete:

1. Run the app and view the change in a browser (e.g. via Playwright) rather than relying on type checking or lint alone.
2. Verify the change with the `ui-ux-pro-max` skill.

Do not mark a UI task done until both steps have been performed.
