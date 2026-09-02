# PRD: FSD v2.1 architecture refactor for the Next.js web app

**Date**: 2026-09-02
**Status**: Draft

## Purpose

`apps/web` currently organizes code by technical type (`src/app`, `src/components`, `src/lib`) with a single 489-line `lib/api.ts` and a flat `components/` folder, so a change to one business domain touches files scattered across three unrelated directories and nothing prevents any module from importing any other. Restructuring the app to Feature-Sliced Design v2.1 — while keeping Next.js App Router as the runtime base — gives every module one obvious home by business domain and makes the allowed dependency direction machine-checkable.

## User Scenarios

- Developer adds a field to the meeting summary -> touches only `entities/meeting`, not a shared 500-line API module also owned by auth and file upload.
- Developer opens the repo for the first time and needs the meeting-file upload flow -> finds all of its UI, API calls, validation constants, and types under one slice directory instead of grepping three folders.
- Developer accidentally imports `features/upload-avatar` from `entities/user` -> CI fails with an explicit layer-violation error instead of the coupling landing in `master`.
- Developer needs a route's page component -> finds a route file under the Next.js router that contains routing concerns only, and the actual page composition in the FSD `_pages` layer.
- Developer deletes a feature -> removes one slice directory and its route file, with confidence nothing else imported its internals, because every slice is only reachable through its public API.

## In scope

**Target structure.** Next.js route files move to `apps/web/app/` (the workspace root, not `src/app/`), and all FSD layers live under `apps/web/src/`:

- `src/_app/` — FSD app layer, underscore-prefixed to avoid the Next.js `app` collision: providers (`AuthProvider`, HeroUI/theme provider), `globals.css`, app-wide config.
- `src/_pages/` — FSD pages layer, underscore-prefixed for symmetry per the official FSD Next.js guide: one slice per route — `home`, `login`, `register`, `profile`, `profile-edit`, `meeting-create`, `meeting-detail`.
- `src/widgets/` — composite blocks used by pages: the meeting detail page's per-file list (file card + transcription card pairs) and its summary panel.
- `src/features/` — user actions: `auth-login`, `auth-register`, `change-password`, `update-username`, `upload-avatar`, `create-meeting`, `upload-meeting-files`, `download-meeting-file`, `delete-meeting-file`, `refresh-transcription`, `refresh-meeting-summary`.
- `src/entities/` — business objects: `session` (token store, JWT decode, login/logout), `user` (profile type + `/users/me` calls, avatar display, `useProfile`), `meeting` (`Meeting`/`ActionItemMetadata`/`DecisionMetadata`/`SummaryStatus`, meeting CRUD calls), `meeting-file` (`MeetingFileMetadata`/`TranscriptionStatus`, file list/upload/download/delete calls, accepted-type + size constants, size formatting, the file metadata card).
- `src/shared/` — the axios instance and request interceptor, `ApiError`/`toApiError`, `API_URL`, domain-agnostic UI (`PasswordVisibilityToggle`, `PasswordConfirmField`, `ThemeToggle`), and domain-agnostic helpers (generic file validation, byte formatting, email local-part).

**Rules enforced.**

- Every slice exposes a public API (`index.ts`); nothing outside a slice imports its internal file paths.
- A module may import only from layers strictly below its own. `_app` and `shared` are exempt from the slice rule, per FSD v2.1.
- Sibling slices on the same layer do not import each other. Where a genuine same-layer dependency exists (notably `entities/meeting` ↔ `entities/meeting-file`), it is resolved either by lifting composition to the page/widget or by an explicit FSD v2.1 cross-import (`@x`) public API — not by a direct deep import.
- Route files under `app/` contain routing concerns only (default export re-exporting a `_pages` slice component, plus `metadata` / segment config where already present). No business logic, no JSX composition.

**Tooling.**

- Steiger (`steiger` + `@feature-sliced/steiger-plugin`) added as a dev dependency with a checked-in config, plus an npm script in `apps/web`, and wired into the repo's existing lint step so it runs in the pre-push hook.
- An ESLint import-boundary rule set in `apps/web/eslint.config.mjs` that fails on upward or same-layer-sibling imports, so violations surface in the editor and in `npm run lint`, not only in Steiger.
- No `tsconfig.json` change is required: `include` is already `**/*.ts` / `**/*.tsx` relative to `apps/web`, so it covers a root `app/`, and route files reach FSD layers through the existing `@/*` → `src/*` alias unchanged. (Verified by prototype — see "Technical limitations".)

**Documentation.** `apps/web/CLAUDE.md`'s "Architecture" section and every per-file path reference in it are rewritten to the new structure, per the root `CLAUDE.md`'s "Keeping documentation in sync" rule.

## Out of scope

- Any change to `apps/api`. This refactor is `apps/web` only.
- Any behavior change: no new features, no altered UI copy, no changed routes/URLs, no renamed or removed `data-testid` attributes, no changed API contracts.
- Migrating client components to React Server Components, or moving data fetching from the client to the server. Everything that is `'use client'` today stays `'use client'`.
- Introducing a state manager (Redux/Zustand/TanStack Query) or replacing axios. `auth-context.tsx` stays React Context.
- Adding a unit-test framework to `apps/web`, or adding new e2e specs beyond keeping the existing suite green.
- Extracting a shared package between `web` and `api`; the hand-mirrored upload constants stay hand-mirrored.
- Replacing HeroUI or Tailwind, or any visual/styling change.
- Restructuring `apps/web/e2e/` into FSD layers — the Playwright suite keeps its current flat layout.

## Technical limitations

- **Next.js reserves both `app` and `pages`**, which collide with FSD's own `app` and `pages` layer names. FSD v2.1's documented answer is to rename _both_ FSD layers to `_app` and `_pages`. Keeping the Next router at `src/app/` would still leave Steiger reading `src/app` as the FSD app layer, so the router must move out of `src/` to `apps/web/app/` for the default Steiger config to be correct without exclusions.
- **Public API barrels and `'use client'`.** Re-exporting client components through `index.ts` barrels can pull unrelated modules of a slice into the client bundle and weaken tree-shaking. Each barrel must not become a catch-all for a slice that mixes client-only and non-client modules, and the `'use client'` directive must survive every hop.
- **Route files must keep Next.js semantics.** A route's default export must remain a React component; `generateMetadata`, `dynamic`, `revalidate`, `runtime`, and `generateStaticParams` must stay in the route file itself, because Next requires segment config to be statically analyzable and a re-export is not. This costs nothing today — the app currently has no segment config and no `generateMetadata`; the only such export is the static `metadata` object in the root layout, which stays in `app/layout.tsx` — but it constrains every future route.

- **The structure itself is verified, not assumed.** A throwaway prototype moved the router to `apps/web/app/`, relocated `providers.tsx` + `globals.css` to a `src/_app/` slice, and converted `/login` to a thin `export { default } from '@/_pages/login'` re-export of a `'use client'` page behind an `index.ts` barrel. `npx tsc --noEmit`, `npx next build`, and `npm run lint` all passed; all 8 routes resolved and `/login` still prerendered as static. So App Router, the `@/*` alias, the `'use client'` directive through a barrel, and `eslint-config-next` all survive the move. The prototype was reverted; the remaining risk in this refactor is the volume of slice-boundary decisions, not the Next.js integration.
- **Steiger's `insignificant-slice` and `public-api` rules will flag thin slices** such as the single-action `download-meeting-file` / `delete-meeting-file` features. Each flagged rule needs an explicit decision — merge the slice or disable the rule with a written reason in the config — rather than being left failing.
- **`apps/web` has no unit tests.** The Playwright e2e suite is the only regression net for a refactor that moves every file in the app, and it runs fully serial with a real Whisper transcription spec, so a full verification pass is slow and must be budgeted.
- **Same-layer entity coupling is real, not hypothetical.** The meeting detail page needs `Meeting` and `MeetingFileMetadata` together, and `MeetingSummary` derives its state from both a meeting and its files' transcription statuses. This is the one place the FSD import rules will genuinely bite and needs a decided approach before the move starts.
- **A whole-app file move churns `git blame`.** Moves must be committed separately from content edits so history stays followable.

## Acceptance Criteria

- [ ] `npx steiger ./src` from `apps/web` exits 0, using a checked-in `steiger.config.*`, with any disabled rule carrying an inline comment stating why.
- [ ] `npm run lint --workspace=web` exits 0, and a deliberately added upward import (e.g. `entities` importing from `features`) makes it exit non-zero.
- [ ] `npm run typecheck --workspace=web` and `npm run build --workspace=web` both exit 0.
- [ ] `npm run test:e2e --workspace=web` passes with no assertion, selector, or `data-testid` changed relative to `master` — the diff to `apps/web/e2e/` contains import-path changes only.
- [ ] `apps/web/src/components/` and `apps/web/src/lib/` no longer exist, and no file remains under `apps/web/src/app/`.
- [ ] Every directory directly under `apps/web/src/` is one of `_app`, `_pages`, `widgets`, `features`, `entities`, `shared`.
- [ ] Every slice under `_pages`, `widgets`, `features`, and `entities` has an `index.ts`, and no import anywhere in `apps/web` reaches into a slice past its `index.ts`.
- [ ] Every file under `apps/web/app/` is a route file (`page.tsx`, `layout.tsx`, or equivalent) containing no JSX beyond rendering a single `_pages` component, and no `axios`/`api` import.
- [ ] `lib/api.ts` is gone: its request functions live in the `api` segment of the entity slice that owns the resource, and only the axios instance, `API_URL`, `ApiError`, and `toApiError` remain shared.
- [ ] Manual pass over the running app confirms every route (`/`, `/login`, `/register`, `/profile`, `/profile/edit`, `/meetings/new`, `/meetings/[id]`) renders and behaves identically to `master`, per `apps/web/CLAUDE.md`'s "UI changes must be visually tested" rule.
- [ ] `apps/web/CLAUDE.md` describes the new structure with no path reference pointing at a file that no longer exists.
