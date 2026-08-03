# Plan: User profile page and profile editing

**PRD:** @docs/prd-user-profile-and-edit-page.md

**Research:** @docs/research-plan-user-profile-and-edit-page.md.md

**Date:** 2026-07-29

## Technical decisions made in this plan (not specified in the PRD)

- **Avatar image display is Bearer-authenticated, not a plain `<img src>` URL.** `apps/web` stores its JWT in `localStorage` (`auth-store.ts`) and attaches it via an axios request interceptor (`http.ts`) — there is no cookie-based session. The existing meeting-file download already follows this same constraint (`api.ts`'s comment: "Downloads via a Bearer-authenticated GET rather than a plain `<a href>`"). Avatars therefore need the same treatment: the frontend fetches the avatar image via an authenticated GET, then renders it from a `Blob`/object URL, everywhere it's shown (profile page, edit page, main page).
- **Route surface:** all new endpoints live under `/users/me/*` (profile GET, username PATCH, avatar POST, avatar GET, password PATCH) — always "the current authenticated user," never a `:id` param, since the PRD is explicitly scoped to a user managing their own profile only.
- **Circular module dependency:** `AuthModule` already imports `UserModule` (to register `UserModule`'s handlers in the CQRS graph). Phase 1 below gives `UserModule` its own controller guarded by `JwtAuthGuard`, which means `UserModule` now needs to import `AuthModule` too — a cycle. Resolved with Nest's standard `forwardRef()` on both sides, rather than restructuring where `JwtAuthGuard` lives.
- **Username validation:** the PRD leaves format/length unspecified beyond "optional, freeform, not unique." The plan applies only the minimal DTO validation needed to keep bad input out (`IsString`, `IsOptional`, a generous `MaxLength` as a sanity cap) — no additional rules invented beyond that.

## Implementation Phases

### Phase 1-user-profile: Backend — schema migration + profile read endpoint

**Goal:** The `User` model gains `username` and avatar metadata fields, and an authenticated user can fetch their own profile via `GET /users/me`. This is the minimum tracer-bullet path everything else builds on.

**Affects:** backend, database

**Tasks:**

- [ ] Write e2e tests first in a new `apps/api/test/user-profile.e2e-spec.ts`: authenticated user fetches their profile and receives `{ id, email, username: null, avatarMimeType: null, avatarUploadedAt: null }` for a freshly registered user; unauthenticated request is rejected
- [ ] Prisma migration: add `username String?`, `avatarPath String?`, `avatarMimeType String?`, `avatarUploadedAt DateTime?` to the `User` model (nullable, mirroring `Meeting`'s existing nullable file columns)
- [ ] Add `UserController` (`src/user/user.controller.ts`) with `GET /users/me`, guarded by `JwtAuthGuard`, reading `request.user.userId`
- [ ] Add `GetUserProfileQuery`/`GetUserProfileHandler` (`@QueryHandler`) returning `{ id, email, username, avatarMimeType, avatarUploadedAt }` — never `password` or `avatarPath` (internal storage detail)
- [ ] Resolve the `UserModule` <-> `AuthModule` circular import with `forwardRef()` on both modules' `imports`
- [ ] Register the new query handler in `UserModule`'s `providers`

**When ready:** e2e test passes; a manual authenticated `curl GET /users/me` against a running API returns the profile shape with `username`/avatar fields `null` for a user who hasn't set them.

### Phase 2-user-profile: Frontend — profile page

**Goal:** An authenticated user can open a profile page showing their avatar (initials placeholder, since avatar upload doesn't exist yet), username-or-email, and email.

**Affects:** frontend

**Tasks:**

- [ ] Add `getProfile()` to `apps/web/src/lib/api.ts` hitting `GET /users/me`
- [ ] Create an initials-placeholder avatar component, deriving initials from `username` if set, else `email`
- [ ] Create `apps/web/src/app/profile/page.tsx`: fetches the profile on load, renders the initials placeholder, `username ?? email`, and `email`
- [ ] Handle the loading state while the profile is being fetched
- [ ] Handle the unauthenticated case (redirect to login, consistent with how other authenticated pages in this app behave)

**When ready:** Visually verified with Playwright: a logged-in user navigates to `/profile` and sees the initials placeholder, their email as the displayed name (no username set yet), and their email.

### Phase 3-user-profile: Backend — update username endpoint

**Goal:** An authenticated user can change (or clear) their own username.

**Affects:** backend

**Tasks:**

- [ ] Extend `user-profile.e2e-spec.ts`: updating the username persists it and a subsequent `GET /users/me` reflects the new value; clearing it (empty string / `null`) reverts subsequent reads to `username: null`; unauthenticated request is rejected
- [ ] Add `UpdateUsernameDto` (`username`: `@IsOptional() @IsString() @MaxLength(50)`)
- [ ] Add `PATCH /users/me/username` on `UserController`, guarded by `JwtAuthGuard`
- [ ] Add `UpdateUsernameCommand`/`UpdateUsernameHandler` (`@CommandHandler`) persisting the new value via Prisma, scoped to `request.user.userId`

**When ready:** e2e tests pass; a manual authenticated `curl PATCH /users/me/username` updates the value, confirmed by a follow-up `GET /users/me`.

### Phase 4-user-profile: Frontend — edit page shell + username form

**Goal:** A `/profile/edit` page exists, linked from the profile page, with a working username form. Avatar upload and password change land in later phases on this same page.

**Affects:** frontend

**Tasks:**

- [ ] Add `updateUsername()` to `apps/web/src/lib/api.ts` hitting `PATCH /users/me/username`
- [ ] Create `apps/web/src/app/profile/edit/page.tsx`, fetching the current profile on load
- [ ] Add a link/button from the profile page (Phase 2) to `/profile/edit`
- [ ] Username form: prefilled with the current value, submits via `updateUsername()`, shows success/error feedback
- [ ] After a successful username update, the profile page reflects the new value on next visit/refetch

**When ready:** Visually verified with Playwright: user opens `/profile/edit` from the profile page link, changes their username, sees a success confirmation, and navigating back to `/profile` shows the new username in place of the email.

### Phase 5-user-profile: Backend — avatar upload and serving endpoints

**Goal:** An authenticated user can upload an avatar image (validated, stored on disk, replacing any previous one), and fetch it back as image bytes.

**Affects:** backend

**Tasks:**

- [ ] Write e2e tests first: valid-type upload persists metadata and a subsequent `GET /users/me/avatar` returns the correct bytes/`Content-Type`; disallowed extension rejected; disallowed MIME type rejected; extension/MIME mismatch rejected; oversized file rejected (no metadata change in each rejection case); re-upload replaces the previous file (old file removed from disk); `GET /users/me/avatar` for a user with no avatar returns `404`; unauthenticated rejected on both routes
- [ ] Add `src/user/upload/avatar-upload.constants.ts`: accepted extension/MIME table (`.jpg`/`.jpeg`/`.png`/`.webp`), `MAX_AVATAR_FILE_SIZE_BYTES` env var (default 5 MB)
- [ ] Configure `multer`/`diskStorage` for a dedicated avatar upload directory (e.g. `uploads/avatars`, server-generated filename via `randomUUID()`, same path-traversal defense as meeting uploads); `mkdirSync` it at startup via `OnModuleInit`, same as `MeetingsModule`
- [ ] Add `POST /users/me/avatar` (`@UseInterceptors(FileInterceptor('file', avatarUploadOptions))`) via `UploadAvatarCommand`/`UploadAvatarHandler`: validate extension+MIME (rejecting mismatches) and size, write the new file, update the user row, then delete the old file (same crash-safe ordering as meeting file replace)
- [ ] Add `GET /users/me/avatar` streaming the stored image with the correct `Content-Type`, `404` if the user has none

**When ready:** All e2e tests in this phase pass; a manual authenticated upload via `curl`/Postman stores the file and a follow-up `GET /users/me/avatar` returns the correct image bytes.

### Phase 6-user-profile: Frontend — avatar upload UI, and avatar everywhere

**Goal:** The edit page can upload a new avatar, and the real avatar (falling back to initials) is displayed on the profile page, the edit page, and the main page — where it also links to the profile page.

**Affects:** frontend

**Tasks:**

- [ ] Add `uploadAvatar(file)` (multipart, mirroring `meeting-file-upload`'s pattern) and an authenticated-avatar-blob fetch helper to `apps/web/src/lib/api.ts`
- [ ] Avatar upload control on `/profile/edit`: file picker, client-side type/size validation mirroring Phase 5's server rules, upload progress, distinct error feedback for invalid type vs oversized vs upload failure
- [ ] Swap the initials-placeholder component (Phase 2) for a shared `Avatar` component: renders the fetched image blob if `avatarMimeType` is set on the profile, else the initials placeholder — used by profile page, edit page, and main page alike
- [ ] After login, fetch the profile (Phase 1's endpoint) into `auth-context` so `username`/avatar info is available app-wide, since the JWT payload alone only carries `{ userId, email }`
- [ ] Wire the main page's logged-in-user area to the shared `Avatar` component plus `username ?? email` text, replacing the current email-only display
- [ ] Make the main page's avatar a link to `/profile`

**When ready:** Visually verified with Playwright: user uploads a valid avatar on the edit page and sees it appear there, on the profile page, and on the main page; uploading an invalid-type or oversized file shows the specific rejection message and leaves the previous avatar/placeholder unchanged; clicking the avatar on the main page navigates to `/profile`.

### Phase 7-user-profile: Backend — password change endpoint

**Goal:** An authenticated user can change their password by providing their correct current password and a valid new one.

**Affects:** backend

**Tasks:**

- [ ] Write e2e tests first: correct current password + valid new password updates it, verified by a subsequent login succeeding with the new password and failing with the old; incorrect current password is rejected and the password is unchanged; new password shorter than 8 characters is rejected and the password is unchanged; unauthenticated request is rejected
- [ ] Add `ChangePasswordDto` (`currentPassword: @IsString() @MinLength(1)`, `newPassword: @IsString() @MinLength(8)`, matching `RegisterDto`'s existing rule)
- [ ] Add a query to fetch a user's credentials by id (mirroring `FindUserByEmailQuery`'s shape, since password verification needs the stored hash) — or extend the existing query/handler if it can be reused cleanly
- [ ] Add `PATCH /users/me/password` on `UserController`, guarded by `JwtAuthGuard`, via `ChangePasswordCommand`/`ChangePasswordHandler`: `bcrypt.compare` the current password against the stored hash (`401` on mismatch, not a validation error, since it's a credential check), then `bcrypt.hash` (10 rounds, matching `CreateUserHandler`'s convention) the new password and persist it

**When ready:** e2e tests pass; a manual flow (change password via `curl`, then log in with the new password, then confirm the old one fails) works against a running API.

### Phase 8-user-profile: Frontend — password change form

**Goal:** The edit page has a working password-change form, completing all three edit capabilities from the PRD.

**Affects:** frontend

**Tasks:**

- [ ] Add `changePassword()` to `apps/web/src/lib/api.ts` hitting `PATCH /users/me/password`
- [ ] Password form on `/profile/edit`: current-password and new-password fields, independently submittable from the username and avatar forms
- [ ] Distinct error feedback for "incorrect current password" vs "new password too short," clearly separated from the username/avatar forms' own feedback
- [ ] Success feedback on password change (form clears; no auto-logout is required by the PRD)

**When ready:** Visually verified with Playwright: user submits a correct current password and valid new password and sees a success message; submitting a wrong current password shows that specific error; submitting a too-short new password shows that specific error; a subsequent manual login with the new password (in a fresh session) succeeds.

## Phasing Rules

- Each phase produces a workable, independently stoppable result.
- Phase 1 is the minimum tracer-bullet path (an actual API change, and the schema, to build everything else on).
- No phase exceeds seven tasks.
- Backend and frontend work for the same capability are always split into separate phases (Phases 1, 3, 5, 7 backend; Phases 2, 4, 6, 8 frontend), interleaved so each backend phase is followed immediately by the frontend phase that makes it visible.
- Backend phases specify e2e tests written before the handlers they cover, per this repo's TDD convention.
- Frontend phases specify Playwright-based visual verification as their test/definition-of-done mechanism, since `apps/web` has no automated test framework configured.
