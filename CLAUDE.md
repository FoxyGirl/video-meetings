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

## Commands (run from repo root)

```bash
npm install                # install once for both workspaces (hoisted node_modules)

npm run dev                # run web (:3000) and api (:3001) concurrently
npm run dev:web            # web only
npm run dev:api            # api only

npm run build              # build both apps (npm run build --workspaces --if-present)
npm run start              # start both apps in production mode (after build)

npm run lint                                # lint both apps
npm run lint --workspace=web                # lint one app
npm run lint --workspace=api

npm run typecheck                           # tsc --noEmit in both apps

npm run test                                # run unit tests in both apps (api only has unit tests currently)
npm run test --workspace=api -- --watch     # forward flags to an app's own script

npm run test:e2e                            # run e2e tests in both apps (needs the Postgres container up, see below)

npm run format          # prettier --write . across the whole repo
npm run format:check    # prettier --check .
```

Any per-app script (see each app's CLAUDE.md) can be run the same way: `npm run <script> --workspace=<web|api>`.

## Local database

A root-level `docker-compose.yml` runs a Postgres 16 instance for local development (service `db`, port `5432` by default). Configure it via a root `.env` file (see `.env.example`).

```bash
docker compose up -d db      # start Postgres in the background
docker compose down          # stop it (add -v to also drop the data volume)
```

`apps/api` connects to it via Prisma — see `apps/api/CLAUDE.md`'s "Database (Prisma)" section. The container also hosts a second database, `video_meetings_test`, used exclusively by `apps/api`'s e2e tests (created automatically on a fresh volume via `docker/postgres-initdb/`).

## Local test user

For manually exercising auth-gated features (e.g. the shared meeting detail page) against the local dev stack, a seeded test user exists in the local Postgres `db` container:

- Email: `qa-test@video-meetings.local`
- Password: `TestPassword123!`

It owns one seeded meeting ("QA Test Meeting") to check the detail page's organizer view. This user only exists in the local dev database (created via `POST /auth/register`) — re-create it the same way after a `docker compose down -v` wipes the volume.

## Keeping documentation in sync

When a change alters the project's architecture — new workspace/app, new shared config, a module/service restructuring, a changed port or entry point, a new database or external dependency — update the relevant `CLAUDE.md` (root and/or the affected app's) in the same change. Don't leave documentation describing a prior structure once the code no longer matches it.

## Git hooks

Husky runs checks at two stages:

- **pre-commit** (`.husky/pre-commit` → `npx lint-staged`): fast, staged-files-only. The `lint-staged` config lives in the root `package.json`: it runs each app's ESLint (with its own `--config`) against its own staged files, and Prettier against all staged web/api files plus repo-level JSON/Markdown/YAML/CSS.
- **pre-push** (`.husky/pre-push` → `npm run lint`, then `npm run test`, then `npm run test:e2e`): slower, whole-repo checks, since a push affects more than just what changed locally. `npm run lint` runs each workspace's full ESLint (not scoped to staged files). `npm run test` runs each workspace's unit test script — currently just `apps/api`'s Jest unit suite (`web` has no `test` script, so `--if-present` skips it). `npm run test:e2e` runs both apps' e2e suites: `apps/api`'s Jest e2e suite (boots the real app in-process against the `video_meetings_test` Postgres database, no separate server needed) and `apps/web`'s Playwright suite (`apps/web/CLAUDE.md`'s "E2E tests" section) — Playwright auto-starts both the `web` and `api` dev servers via its `webServer` config if they aren't already running (and tears them down after), reusing them if you already have `npm run dev` up. **The Postgres container (`docker compose up -d db`, see "Local database" above) must already be running for a push to succeed** — nothing in this hook starts it for you.

Don't bypass either with `--no-verify` to "fix" a failing commit/push — fix the lint/format/test issue instead.

## Pull requests

- Start the PR title with a fitting [Gitmoji](https://gitmoji.dev/) (e.g. `✨ feat(web): ...`, `🐛 fix(api): ...`).
- NEVER merge an open pull request. Merging is a decision for the developers to make in the remote repo.
