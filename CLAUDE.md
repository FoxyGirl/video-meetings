# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

npm workspaces monorepo (`workspaces: ["apps/*"]`) with two independent apps:

- `apps/web` — Next.js (App Router, TypeScript, Tailwind CSS) — see `apps/web/CLAUDE.md`
- `apps/api` — NestJS (TypeScript, Jest) — see `apps/api/CLAUDE.md`

The two apps do not share code or a package today; each has its own `package.json`, `tsconfig.json`, and `eslint.config.mjs`. The only shared root-level pieces are:

- `tsconfig.base.json` — minimal common `compilerOptions` (`esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames`, `resolveJsonModule`, `isolatedModules`), extended by both apps' `tsconfig.json`. Each app then layers on its own framework-specific settings (e.g. web sets its own `strict`, api sets individual `strictNullChecks`/`noImplicitAny`/`strictBindCallApply` rather than full `strict` mode — don't collapse these into the base without checking both apps still compile).
- `.prettierrc` / `.prettierignore` — single Prettier config shared by both apps (neither app has its own `.prettierrc`).
- ESLint is _not_ unified — each app keeps its own flat config (`eslint-config-next` for web, `typescript-eslint` + `eslint-plugin-prettier` for api) because the two frameworks' recommended rulesets are incompatible with a single shared ruleset. Both configs pull in `eslint-config-prettier` to avoid formatting-rule conflicts with Prettier.

api's dev server defaults to port 3001 (not Nest's default 3000) specifically to avoid colliding with web's port 3000 when both run together via `npm run dev`.

## Token efficiency

- `git diff` always with `--unified=0`
- `git log` always with `--oneline -10`
- `gh issue list` always with `--json number,title`
- `npm run test` always with `--silent`
- `npx tsc --noEmit` always with `2>&1 | tail -50` (a `-5` cutoff can truncate mid-error, since a single TS error spans several lines)

## Commands (run from repo root)

See `package.json`'s `scripts` for the full list. A few things not obvious from the script names alone:

- `npm run dev` runs web (`:3000`) and api (`:3001`) concurrently; `npm run dev:web` / `npm run dev:api` run just one.
- Target a single workspace with `--workspace=<web|api>` (e.g. `npm run lint --workspace=web`); forward flags to an app's own script with `-- <flags>` (e.g. `npm run test --workspace=api -- --watch`).
- `npm run test` currently only runs `apps/api`'s unit tests — `web` has no `test` script yet, so `--if-present` skips it.
- `npm run test:e2e` needs the Postgres container up first (see "Local database" below).

Any per-app script (see each app's CLAUDE.md) can be run the same way: `npm run <script> --workspace=<web|api>`.

## Local database

A root-level `docker-compose.yml` runs a Postgres 16 instance for local development (service `db`, port `5432` by default). Configure it via a root `.env` file (see `.env.example`).

```bash
docker compose up -d db      # start Postgres in the background
docker compose down          # stop it (add -v to also drop the data volume)
```

`apps/api` connects to it via Prisma — see `apps/api/CLAUDE.md`'s "Database (Prisma)" section. The container also hosts a second database, `video_meetings_test`, used exclusively by `apps/api`'s e2e tests (created automatically on a fresh volume via `docker/postgres-initdb/`).

## Local Whisper transcription

`apps/api` transcribes uploaded meeting recordings locally via [`nodejs-whisper`](https://www.npmjs.com/package/nodejs-whisper) (Whisper "tiny" model, no cloud API) — see `apps/api/CLAUDE.md`'s "Meetings" section for the feature itself. Like Postgres and Playwright's browser binary, this needs setup outside of `npm install`:

- **A C/C++ toolchain + CMake**, so `nodejs-whisper` can build its vendored `whisper.cpp` on first use (Linux: `sudo apt install build-essential cmake`; macOS: Xcode Command Line Tools + `brew install cmake`; Windows: MSYS2/MinGW-w64). This first build compiles whisper.cpp's whole example/test suite, not just the one binary this project needs — budget **5+ minutes and real RAM** for it, not just disk space; an interrupted build leaves the install broken until `cmake --build build --config Release` is re-run by hand inside `node_modules/nodejs-whisper/cpp/whisper.cpp/`.
- **`ffmpeg` on `PATH`** (`apt install ffmpeg` / `brew install ffmpeg` / a Windows installer). `nodejs-whisper` shells out to whatever `ffmpeg` it finds — there's no way to point it at a specific binary.
- The "tiny" model (`ggml-tiny.bin`, ~74 MB) downloads automatically to `apps/api/.whisper-models/` (gitignored, override with `WHISPER_MODEL_ROOT_PATH`) the first time a transcription actually runs — no manual download step today.

`TRANSCRIPTION_ENABLED` (`apps/api/src/meetings/transcription/whisper.constants.ts`) defaults on; `apps/api/.env.test` turns it off for the bulk of the e2e suite (which uploads synthetic, non-media bytes) and the transcription-specific spec turns it back on for itself — see that file for why.

## Local test user

For manually exercising auth-gated features (e.g. the shared meeting detail page) against the local dev stack, a seeded test user exists in the local Postgres `db` container:

- Email: `qa-test@video-meetings.local`
- Password: `TestPassword123!`

It owns one seeded meeting ("QA Test Meeting") to check the detail page's organizer view. This user only exists in the local dev database (created via `POST /auth/register`) — re-create it the same way after a `docker compose down -v` wipes the volume.

## Active feature plans

- `docs/plan-user-profile-and-edit-page.md` (PRD: `docs/prd-user-profile-and-edit-page.md`; research: `docs/research-plan-user-profile-and-edit-page.md.md`) — user profile page and profile editing. Consult the research file before implementing any phase of this plan; it maps each phase onto this repo's existing CQRS/upload/HTTP-client patterns.
- `docs/plan-transcribe-uploaded-meeting-files-with-local-whisper.md` (PRD: `docs/prd-transcribe-uploaded-meeting-files-with-local-whisper.md`; research: `docs/research-transcribe-uploaded-meeting-files-with-local-whisper.md`) — automatic local Whisper "tiny" transcription of a meeting's uploaded recording, with status/transcript display and a "Refresh Transcription" action. Consult the research file first: it resolves the runtime choice the plan left open and flags e2e fixtures that break under this feature.

## Keeping documentation in sync

When a change alters the project's architecture — new workspace/app, new shared config, a module/service restructuring, a changed port or entry point, a new database or external dependency — update the relevant `CLAUDE.md` (root and/or the affected app's) in the same change. Don't leave documentation describing a prior structure once the code no longer matches it.

## Git hooks

Husky runs checks at two stages:

- **pre-commit** (`.husky/pre-commit` → `npx lint-staged`): fast, staged-files-only. The `lint-staged` config lives in the root `package.json`: it runs each app's ESLint (with its own `--config`) against its own staged files, and Prettier against all staged web/api files plus repo-level JSON/Markdown/YAML/CSS.
- **pre-push** (`.husky/pre-push` → `npm run lint`, then `npm run test`, then `npm run test:e2e`): slower, whole-repo checks, since a push affects more than just what changed locally. `npm run lint` runs each workspace's full ESLint (not scoped to staged files). `npm run test` runs each workspace's unit test script — currently just `apps/api`'s Jest unit suite (`web` has no `test` script, so `--if-present` skips it). `npm run test:e2e` runs both apps' e2e suites: `apps/api`'s Jest e2e suite (boots the real app in-process against the `video_meetings_test` Postgres database, no separate server needed) and `apps/web`'s Playwright suite (`apps/web/CLAUDE.md`'s "E2E tests" section) — Playwright auto-starts both the `web` and `api` dev servers via its `webServer` config if they aren't already running (and tears them down after), reusing them if you already have `npm run dev` up. **The Postgres container (`docker compose up -d db`, see "Local database" above) must already be running for a push to succeed.** A `pretest:e2e` script (`scripts/check-postgres.sh`, runs automatically before `test:e2e` via npm's `pre<script>` convention) checks this upfront with `docker compose exec db pg_isready` and fails fast with a clear "start it with `docker compose up -d db`" message instead of letting the failure surface later as an opaque Playwright `webServer` timeout.

Don't bypass either with `--no-verify` to "fix" a failing commit/push — fix the lint/format/test issue instead.

## Pull requests

- Start the PR title with a fitting [Gitmoji](https://gitmoji.dev/) (e.g. `✨ feat(web): ...`, `🐛 fix(api): ...`).
- NEVER merge an open pull request. Merging is a decision for the developers to make in the remote repo.
