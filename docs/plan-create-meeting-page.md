# Plan: Create meeting page

**PRD:** docs/prd-create-meeting-page.md

**Date:** 2026-08-19

## Implementation Phases

### Phase 1-create-meeting-page: Frontend — create-meeting page tracer bullet

**Goal:** An authenticated user can navigate to `/meetings/new` from the home page, submit a valid title/date/participants form, and land on the new meeting's detail page. An unauthenticated visitor is redirected to `/login`, consistent with the app's other authenticated pages.

**Affects:** frontend

**Tasks:**

- [ ] Write e2e tests first in a new `apps/web/e2e/meeting-create.spec.ts`: an authenticated user creates a meeting via the form and is redirected to `/meetings/[id]`, which shows the submitted title, date, and participants; an unauthenticated visit to `/meetings/new` redirects to `/login`
- [ ] Add `createMeeting()` to `apps/web/src/lib/api.ts` hitting `POST /meetings`, following the existing `toApiError()` pattern used by `getMeetings()`/`getMeeting()` (`401` -> "Your session has expired. Please sign in again.")
- [ ] Create `apps/web/src/app/meetings/new/page.tsx`: form fields for title, date/time, and participant email(s); auth-gating redirect to `/login` when logged out, matching the pattern already used by `/profile/edit` and the home page
- [ ] Wire the submit handler to call `createMeeting()` and redirect to `/meetings/[id]` (using the returned meeting's `id`) on success
- [ ] Add a "New meeting" link/button on the home page (`apps/web/src/app/page.tsx`), near the existing "Your meetings" list, pointing to `/meetings/new`

**When ready:** e2e tests pass; visually verified with Playwright: a logged-in user clicks "New meeting" from the home page, fills in a valid title/date/participant, submits, and lands on the new meeting's detail page showing the submitted data; navigating to `/meetings/new` while logged out redirects to `/login`.

### Phase 2-create-meeting-page: Frontend — validation and error feedback

**Goal:** Invalid submissions (empty title, invalid date, missing or malformed participants) are rejected client-side with clear, specific messages before any request is sent; a failed or session-expired submit shows correct feedback.

**Affects:** frontend

**Tasks:**

- [ ] Write e2e tests first: submitting with an empty title, an invalid/empty date, or no participants (or a participant that isn't a valid email) each shows a clear, specific validation error and issues no request; a `401` on submit logs the user out and redirects to `/login`
- [ ] Add client-side validation on the title field (non-empty), mirroring `CreateMeetingDto`'s `@IsNotEmpty()`
- [ ] Add client-side validation on the date field (a valid, non-empty date/time), mirroring `CreateMeetingDto`'s `@IsISO8601()`
- [ ] Support entering multiple participant emails, each validated as syntactically valid, mirroring `CreateMeetingDto`'s `@IsEmail({}, { each: true })`; require at least one participant before submit (the PRD's "Technical limitations" note that the server itself doesn't currently enforce a non-empty list, so this check must live client-side)
- [ ] Handle a `401` on submit through the same session-expiry pattern the rest of the app uses (log out, redirect to `/login`)
- [ ] Show a clear, form-level error message for any other server-side rejection on submit

**When ready:** e2e tests pass; visually verified with Playwright: submitting with an empty title, invalid date, or no/invalid participants shows the specific validation message for that field and issues no network request; forcing a `401` response on submit logs the user out and redirects to `/login`.
