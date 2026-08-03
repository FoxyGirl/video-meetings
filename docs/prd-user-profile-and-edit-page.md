# PRD: User profile page and profile editing

**Date**: 2026-07-28
**Status**: Draft

## Purpose

A logged-in user needs a place to view and manage their own identity in the app — see their profile, change their display name, upload an avatar, and change their password — and needs their avatar visible wherever they're identified as the logged-in user, so the app feels personalized and account management doesn't require a support request.

## User Scenarios

- User opens their profile page -> sees their avatar (or initials placeholder), username (or email if no username set), and email.
- User opens the profile edit page -> sees a form to change username, upload a new avatar, and change password.
- User changes their username and saves -> new username is persisted and immediately reflected on the profile page and the main page.
- User uploads a new avatar image and saves -> new avatar replaces the previous one (or the initials placeholder) everywhere it's shown.
- User uploads a file that isn't an accepted image type or exceeds the size limit -> upload is rejected with a clear error message, and no avatar is changed.
- User submits a password change with the correct current password and a valid new password -> password is updated; the old password no longer authenticates.
- User submits a password change with an incorrect current password -> request is rejected with a clear error message, and the password is unchanged.
- User submits a new password that fails validation (e.g. too short) -> request is rejected with a clear error message, and the password is unchanged.
- User has not set a username -> profile page, edit page, and main page all show their email in its place; avatar area shows generated initials if no avatar was uploaded either.
- User is logged in and viewing the main page -> sees their avatar (image or initials placeholder) and username/email; clicking the avatar navigates to their profile page.
- Unauthenticated visitor requests any profile or profile-edit endpoint -> request is rejected (existing `JwtAuthGuard` behavior).

## In scope

- New `username` (nullable, not unique) and avatar-related fields on the `User` Prisma model (requires a migration) — see "Technical limitations" for the exact fields.
- API endpoint to fetch the current authenticated user's profile (id, email, username, avatar info), protected by `JwtAuthGuard`.
- API endpoint to update the current authenticated user's username.
- API endpoint to upload/replace the current authenticated user's avatar image, protected by `JwtAuthGuard`, reusing the existing local-disk upload pattern (`multer` + `diskStorage`) already used for meeting recording files.
- Server-side validation of uploaded avatar images: allowed image MIME types/extensions and a maximum file size (see "Accepted avatar file types" below).
- API endpoint to change the current authenticated user's password, requiring the current password and a new password; verifies the current password with `bcrypt.compare` before updating (mirrors the existing login credential-check pattern), and re-hashes the new password with `bcrypt` before persisting.
- Web profile page (`/profile` or similar): read-only display of avatar, username (or email fallback), and email, plus a link/button to the edit page.
- Web profile edit page: form to change username, upload a new avatar, and change password (current + new password fields), each independently submittable.
- Client-side validation of avatar file type/size before submitting, mirroring the server-side rules.
- Avatar display (uploaded image, or generated initials placeholder when none is set) wired into: the profile page, the profile edit page, and the main page's "logged-in user" area.
- Main page: avatar is a clickable link to the profile page; the text next to it shows the username, falling back to email when no username is set.
- User-facing error feedback for all three actions (username update, avatar upload, password change) — validation errors and current-password mismatch shown clearly and distinctly from each other.

## Accepted avatar file types

Mirrors the existing meeting-file validation pattern (`apps/api/src/meetings/upload/file-upload.constants.ts`), adapted to images:

| Extension | MIME type    |
| --------- | ------------ |
| `.jpg`    | `image/jpeg` |
| `.jpeg`   | `image/jpeg` |
| `.png`    | `image/png`  |
| `.webp`   | `image/webp` |

Validation checks both the file extension and the declared MIME type — a mismatch is rejected.

**Maximum file size:** 5 MB. A file exceeding this limit is rejected with a clear error message. Configurable via an env var, following the existing `MAX_UPLOAD_FILE_SIZE_BYTES` precedent (e.g. a separate `MAX_AVATAR_FILE_SIZE_BYTES`, since a 500 MB recording limit is not appropriate for an avatar).

## Out of scope

- Image cropping/resizing/editing UI — the uploaded file is stored and displayed as-is (client-side display sizing only, no server-side image processing).
- Multiple avatars or avatar history — one avatar per user, always replaced on re-upload, same replace semantics as meeting file uploads.
- Editing email address — this iteration only covers username, avatar, and password.
- Username uniqueness enforcement or reserved-name checks — usernames are optional, freeform, and may duplicate across users.
- "Forgot password" / password reset via email — this iteration only covers changing a password while already logged in and knowing the current one.
- Deleting an uploaded avatar (reverting to the initials placeholder) without replacing it — only replace-by-re-upload is in scope.
- Showing other users' profile pages (e.g. viewing a meeting participant's profile) — this PRD covers only the logged-in user's own profile.
- Real-time propagation of profile changes to other already-open browser tabs/sessions — a page reload/refetch is sufficient.
- External/object storage (e.g. S3-compatible) for avatars — local disk only, same as meeting files.
- Virus/malware scanning of uploaded avatar images.

## Technical limitations

- The `User` Prisma model (`apps/api/prisma/schema.prisma`) currently has only `id`, `email`, `password`, `createdAt` — no `username` or avatar fields exist. A migration is required to add `username String?` and avatar metadata fields (e.g. `avatarPath`, `avatarMimeType`, `avatarUploadedAt`, all nullable, mirroring the pattern already used for `Meeting`'s nullable file columns).
- There is no existing `UserModule` HTTP surface today — it's currently reached only internally via `CommandBus`/`QueryBus` from `AuthModule`. This feature requires adding a controller (or extending an existing module) to expose profile read/update, avatar upload, and password-change endpoints over HTTP, following the same CQRS command/query pattern used elsewhere in the repo (no ad hoc services).
- No file storage exists for anything other than meeting recordings; avatar upload reuses the same `multer`/`diskStorage` mechanics but needs its own upload directory (or a subdirectory) and its own accepted-type/size constants, since images and recordings have very different validation rules.
- `auth-context.tsx` and the main page (`apps/web/src/app/page.tsx`) currently only carry/display `auth.email` from the JWT payload — no username or avatar. Adding username/avatar to what's shown on the main page requires fetching the profile (via the new profile endpoint) after login, not just decoding the JWT, since the JWT payload (`{ userId, email }`) does not carry these fields.
- Password change re-uses `bcrypt` (10 salt rounds, matching `CreateUserHandler`'s existing convention) for hashing the new password and `bcrypt.compare` for verifying the current one; no new hashing library is introduced.
- No image processing/resizing library exists in the repo today; avatars are stored and served at their original uploaded resolution.

## Acceptance Criteria

- [ ] An authenticated user can view their own profile page showing avatar (or initials placeholder), username (or email fallback), and email.
- [ ] An authenticated user can change their username from the edit page, and the new value is reflected on the profile page and main page without further action beyond a reload/refetch.
- [ ] An authenticated user can upload a new avatar image from the edit page, and it replaces any previous avatar (or the initials placeholder) on the profile page, edit page, and main page.
- [ ] Uploading an avatar that fails type or size validation is rejected with a clear, specific error message, and no avatar is changed.
- [ ] An authenticated user can change their password by providing the correct current password and a new password (min 8 characters, same rule as registration); subsequent login requires the new password, and the old password no longer works.
- [ ] Submitting a password change with an incorrect current password is rejected with a clear error message, and the password is unchanged.
- [ ] Submitting a new password shorter than 8 characters is rejected with a clear error message, and the password is unchanged.
- [ ] A user with no username set sees their email in its place on the profile page, edit page, and main page.
- [ ] A user with no avatar uploaded sees a generated initials placeholder (derived from username or email) on the profile page, edit page, and main page.
- [ ] On the main page, clicking the avatar navigates to the profile page.
- [ ] An unauthenticated request to any profile, avatar upload, or password-change endpoint is rejected.
- [ ] e2e test: authenticated user fetches their own profile and receives id, email, username (or null), and avatar metadata (or null).
- [ ] e2e test: authenticated user updates their username and a subsequent profile fetch reflects the new value.
- [ ] e2e test: authenticated user uploads a valid accepted-type avatar image and a subsequent profile fetch reflects the new avatar metadata.
- [ ] e2e test: uploading an avatar of a disallowed type (extension, MIME type, or a mismatch between the two) is rejected and the avatar is unchanged.
- [ ] e2e test: uploading an avatar exceeding the maximum size is rejected and the avatar is unchanged.
- [ ] e2e test: authenticated user changes their password with the correct current password, then logs in successfully with the new password and fails to log in with the old one.
- [ ] e2e test: password change with an incorrect current password is rejected and the original password still authenticates.
- [ ] e2e test: password change with a new password shorter than 8 characters is rejected and the original password still authenticates.
- [ ] e2e test: an unauthenticated request is rejected for profile fetch, username update, avatar upload, and password change.
