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

## Architecture

- App Router lives under `src/app`. `layout.tsx` is the root layout, `page.tsx` the home route, `globals.css` the Tailwind entry point.
- `tsconfig.json` extends the repo's `../../tsconfig.base.json` and adds Next-specific compiler options (`bundler` module resolution, `jsx: react-jsx`, the `next` TS plugin, and the `.next/types` includes) — don't remove the `extends` when regenerating this file.
- `eslint.config.mjs` composes `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`, then `eslint-config-prettier` to disable any rules that conflict with the repo's shared Prettier config (`../../.prettierrc`). There is no local `.prettierrc` — formatting is controlled entirely from the repo root.
- Styling is Tailwind CSS v4 via `@tailwindcss/postcss` (see `postcss.config.mjs`); there's no `tailwind.config.*` file since v4 configures via CSS (`globals.css`) rather than a JS config.

## In-progress: meeting recording file upload (frontend)

Implementing the meeting detail page and its upload/download/delete UI (`../../docs/plan-meeting-file-upload-storage-and-display.md` Phases 2, 5, 6)? Read `../../docs/research-meeting-file-upload-storage-and-display.md` first — its "Phase 5–6 (frontend)" section covers the decided Axios-with-request-interceptor client setup (replacing per-call `fetch`/`accessToken` plumbing), upload progress via `onUploadProgress`, and the blob + object-URL pattern for authenticated downloads. Remove this note once the feature ships.

## UI changes must be visually tested

Any change that affects the UI (component markup, styling, layout, theming, interactive behavior) must be visually verified before the task is considered complete:

1. Run the app and view the change in a browser (e.g. via Playwright) rather than relying on type checking or lint alone.
2. Verify the change with the `ui-ux-pro-max` skill.

Do not mark a UI task done until both steps have been performed.
