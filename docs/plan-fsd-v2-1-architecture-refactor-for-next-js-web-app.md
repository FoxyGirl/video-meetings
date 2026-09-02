# Plan: FSD v2.1 architecture refactor for the Next.js web app

**PRD:** docs/prd-fsd-v2-1-architecture-refactor-for-next-js-web-app.md

**Date:** 2026-09-02

## Note on testing per phase

The PRD puts "adding new e2e specs beyond keeping the existing suite green" out of scope — this is a pure restructuring with no behavior change, and the existing Playwright suite is the contract (`apps/web/e2e/` diff must be import-path-only). So no phase below writes new specs; each phase's test step is running the existing specs that exercise the pages/features it touched, plus the full suite, to prove zero regression.

## Implementation Phases

### Phase 1-fsd-v2: Router relocation, tooling, and the login vertical (tracer bullet)

**Goal:** Prove the whole approach for real — not a prototype — by relocating the Next.js router to the workspace root, standing up the architecture-enforcement tooling, and fully migrating one complete vertical slice (login) through every FSD layer. This validates the pattern every later phase repeats.

**Affects:** frontend

**Tasks:**

- [ ] Move `apps/web/src/app/` to `apps/web/app/` as a pure directory move with no content edits, committed separately from any later content change; confirm `next build`, `npx tsc --noEmit`, `npm run lint --workspace=web`, and the full Playwright suite all stay green.
- [ ] Add `steiger` and `@feature-sliced/steiger-plugin` as dev dependencies with a checked-in `steiger.config.ts` (renaming FSD's `app`/`pages` layers to `_app`/`_pages`) and an `npm run fsd:lint --workspace=web` script; run it advisory-only for now (not yet wired into `npm run lint` or pre-push, since `src/components`/`src/lib` still exist and will fail it).
- [ ] Add an ESLint import-boundary rule set to `apps/web/eslint.config.mjs`, scoped only to `src/{_app,_pages,widgets,features,entities,shared}/**` so it doesn't fail on the untouched `src/components`/`src/lib` yet; verify it fails on a deliberately added upward or same-layer-sibling import and passes otherwise.
- [ ] Extract `src/shared/api/`: the axios instance + request interceptor, `ApiError`, `toApiError`, `API_URL` (from `lib/http.ts`); delete `lib/http.ts` and repoint its call sites in `lib/api.ts` to `@/shared/api`.
- [ ] Create `src/entities/session/` (token store, JWT decode, login/logout primitives, from `auth-store.ts`) with a public API (`index.ts`).
- [ ] Create `src/features/auth-login/` (the login form/submit logic and `loginUser`/`AuthResult`, from `app/login/page.tsx` and `lib/api.ts`) and `src/_pages/login/`; convert `app/login/page.tsx` to a thin re-export of the `_pages/login` component.
- [ ] Create `src/_app/` (providers, `globals.css`, from `app/providers.tsx` and `app/globals.css`) and update `app/layout.tsx`'s imports accordingly.

**Tests:** Full `npm run test:e2e --workspace=web` run. Since there is no dedicated login spec, the regression signal is the specs that log the seeded test user in as setup (`meeting-create.spec.ts`, `profile.spec.ts`, `profile-edit.spec.ts`, `meeting-detail.spec.ts`) plus `register.spec.ts` for the adjacent register flow — all must stay green.

**When ready:** `apps/web/app/` holds the router with `/login` as a re-export; `src/lib/http.ts` is gone; login is fully expressed through `_app`/`_pages/login`/`features/auth-login`/`entities/session`/`shared`; build, typecheck, lint, and the full e2e suite are green.

### Phase 2-fsd-v2: Auth and user domain

**Goal:** Complete the rest of the auth/profile domain — register, profile, and profile-edit — and retire `auth-context.tsx`, `use-profile.ts`, and the avatar/password shared components into their FSD homes.

**Affects:** frontend

**Tasks:**

- [ ] Create `src/entities/user/`: `UserProfile` type, `getProfile()`, `useProfile`, and the avatar display components (`UserAvatar`, `CurrentUserAvatar`, `useAvatarImageUrl`), from `auth-context.tsx`, `use-profile.ts`, and `components/avatar.tsx`.
- [ ] Split `auth-context.tsx`'s `AuthProvider`/`useAuth`: session-only state stays in `entities/session`, profile-fetch orchestration moves into `entities/user`; repoint `src/_app`'s provider tree to the new locations.
- [ ] Create `src/features/auth-register/` (from `app/register/page.tsx` and `registerUser`) and `src/_pages/register/`; convert `app/register/page.tsx` to a re-export.
- [ ] Create `src/_pages/profile/` (from `app/profile/page.tsx`); create `src/features/change-password/`, `src/features/update-username/`, `src/features/upload-avatar/` and `src/_pages/profile-edit/` (from `app/profile/edit/page.tsx` and `components/avatar-upload.tsx`); convert both route files to re-exports.
- [ ] Move `PasswordVisibilityToggle` and `PasswordConfirmField` into `src/shared/ui/` (used by login, register, and profile-edit alike).
- [ ] Delete `auth-store.ts`, `auth-context.tsx`, `use-profile.ts`, `components/avatar.tsx`, `components/avatar-upload.tsx`, `components/password-confirm-field.tsx`, `components/password-visibility-toggle.tsx` once every remaining import is repointed.

**Tests:** `register.spec.ts`, `profile.spec.ts`, `profile-edit.spec.ts`, `avatar-upload.spec.ts`, plus the full suite (to catch regressions in any spec that logs in or reads profile data as setup).

**When ready:** `/register`, `/profile`, `/profile/edit` are fully FSD; the listed legacy auth/profile files no longer exist; build, typecheck, lint, and the full e2e suite are green.

### Phase 3-fsd-v2: Meeting domain — list and create

**Goal:** Establish `entities/meeting` and migrate the home page and meeting-creation flow, the two remaining routes that don't depend on the meeting-file domain.

**Affects:** frontend

**Tasks:**

- [ ] Create `src/entities/meeting/`: `Meeting`, `CreateMeetingPayload`, `ActionItemMetadata`, `DecisionMetadata`, `SummaryStatus`, and `getMeetings`/`getMeeting`/`createMeeting`, from `lib/api.ts`.
- [ ] Create `src/_pages/home/` (from `app/page.tsx`) and convert `app/page.tsx` to a re-export.
- [ ] Create `src/features/create-meeting/` (from `app/meetings/new/page.tsx`) and `src/_pages/meeting-create/`; convert `app/meetings/new/page.tsx` to a re-export.
- [ ] Wire `entities/session`/`entities/user` into the home page's logged-in greeting/avatar composition.

**Tests:** `home.spec.ts`, `meeting-create.spec.ts`, plus the full suite.

**When ready:** `/` and `/meetings/new` are fully FSD; build, typecheck, lint, and the full e2e suite are green.

### Phase 4-fsd-v2: Meeting-file domain — detail page and widgets

**Goal:** Migrate the largest remaining domain — meeting detail, file upload/display, transcription, and summary — including the one deliberate same-layer coupling call the PRD flags between `entities/meeting` and `entities/meeting-file`.

**Affects:** frontend

**Tasks:**

- [ ] Decide and record (inline comment in the relevant `index.ts`) how the `entities/meeting` ↔ `entities/meeting-file` coupling is resolved — composition lifted to a widget, or an explicit FSD v2.1 `@x` cross-import — before writing the entities that depend on the decision.
- [ ] Create `src/entities/meeting-file/`: `MeetingFileMetadata`, `TranscriptionStatus`, accepted-type/size constants, `formatFileSize`, and `listMeetingFiles`/`downloadMeetingFile`/`deleteMeetingFile`, from `lib/file-types.ts` and `lib/api.ts`, plus the file metadata card UI from `components/meeting-file-display.tsx`.
- [ ] Create `src/features/upload-meeting-files/`, `src/features/download-meeting-file/`, `src/features/delete-meeting-file/`, `src/features/refresh-transcription/`, `src/features/refresh-meeting-summary/`, from `components/meeting-file-upload.tsx`, the refresh actions in `components/meeting-transcription.tsx` and `components/meeting-summary.tsx`, and their `lib/api.ts` functions.
- [ ] Create `src/widgets/meeting-files/` (per-file list pairing the file card and transcription card) and `src/widgets/meeting-summary/` (the summary/action-items/decisions display, excluding its refresh action).
- [ ] Create `src/_pages/meeting-detail/` (from `app/meetings/[id]/page.tsx`) and convert the route file to a re-export.
- [ ] Delete `lib/api.ts`, `lib/file-types.ts`, `components/meeting-file-upload.tsx`, `components/meeting-file-display.tsx`, `components/meeting-transcription.tsx`, `components/meeting-summary.tsx` once every remaining import is repointed.

**Tests:** `meeting-detail.spec.ts`, `meeting-file-upload.spec.ts`, `meeting-file-management.spec.ts`, `meeting-transcription.spec.ts` (real, serial Whisper inference — budget for it per the PRD's technical limitations), `meeting-summary.spec.ts`, plus the full suite.

**When ready:** `/meetings/[id]` is fully FSD; `src/components/` and `src/lib/` no longer exist anywhere in the tree; build, typecheck, lint, and the full e2e suite are green.

### Phase 5-fsd-v2: Full enforcement and documentation

**Goal:** Turn on whole-tree enforcement now that every route is FSD-compliant, and bring `apps/web/CLAUDE.md` back in sync — the step that makes every PRD acceptance criterion true, not just each domain's own.

**Affects:** frontend

**Tasks:**

- [ ] Widen the ESLint import-boundary rule's scope to all of `src/**` (no longer excluding the now-deleted `components`/`lib`); confirm `npm run lint --workspace=web` still fails on a deliberately added upward import.
- [ ] Wire `npx steiger ./src` into `apps/web`'s lint step so it runs as part of the repo's pre-push hook; resolve every reported violation, disabling any individual rule only with an inline comment stating why (e.g. `insignificant-slice` for a genuinely single-action feature).
- [ ] Rewrite `apps/web/CLAUDE.md`'s "Architecture" section and every per-file path reference to match the final structure.
- [ ] Run the full Playwright suite once more, then do the manual pass over all seven routes (`/`, `/login`, `/register`, `/profile`, `/profile/edit`, `/meetings/new`, `/meetings/[id]`) per `apps/web/CLAUDE.md`'s "UI changes must be visually tested" rule.
- [ ] Walk the PRD's Acceptance Criteria checklist item by item and confirm each one directly.

**Tests:** `npm run test:e2e --workspace=web`, `npm run lint --workspace=web`, `npm run typecheck --workspace=web`, `npm run build --workspace=web`, `npx steiger ./src`.

**When ready:** every PRD acceptance criterion passes.
