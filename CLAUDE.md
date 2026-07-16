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

npm run test                                # run tests in both apps (api only has tests currently)
npm run test --workspace=api -- --watch     # forward flags to an app's own script

npm run format          # prettier --write . across the whole repo
npm run format:check    # prettier --check .
```

Any per-app script (see each app's CLAUDE.md) can be run the same way: `npm run <script> --workspace=<web|api>`.

## Keeping documentation in sync

When a change alters the project's architecture — new workspace/app, new shared config, a module/service restructuring, a changed port or entry point, a new database or external dependency — update the relevant `CLAUDE.md` (root and/or the affected app's) in the same change. Don't leave documentation describing a prior structure once the code no longer matches it.

## Git hooks

Husky + lint-staged run on pre-commit (`.husky/pre-commit` → `npx lint-staged`). The `lint-staged` config lives in the root `package.json`: it runs each app's ESLint (with its own `--config`) against its own staged files, and Prettier against all staged web/api files plus repo-level JSON/Markdown/YAML/CSS. Don't bypass this with `--no-verify` to "fix" a failing commit — fix the lint/format issue instead.
