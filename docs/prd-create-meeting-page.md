# PRD: Create meeting page

**Date**: 2026-08-19
**Status**: Draft

## Purpose

A logged-in user needs a way to schedule a new meeting from the web app. The backend already exposes `POST /meetings` (title, date, participant emails), but no page or form in `apps/web` calls it — a user currently has no way to add a meeting other than a raw API request.

## User Scenarios

- User clicks "New meeting" from the home page -> lands on a dedicated create-meeting page with an empty form.
- User fills in title, date/time, and at least one participant email, and submits -> meeting is created, and the user is taken to that meeting's detail page (`/meetings/[id]`).
- User submits with an empty title -> request is rejected client-side with a clear error message, and no request is sent.
- User submits with a date that isn't a valid date/time -> request is rejected client-side with a clear error message, and no request is sent.
- User submits with no participants, or with a participant entry that isn't a valid email -> request is rejected client-side with a clear error message, and no request is sent.
- User's session has expired when they submit -> treated the same as every other authenticated mutation in this app: logged out and redirected to `/login`.
- User navigates to the create-meeting page while logged out -> redirected to `/login`, consistent with every other authenticated page in this app.
- Unauthenticated request to `POST /meetings` -> rejected (existing `JwtAuthGuard` behavior; no backend change in this iteration).

## In scope

- `createMeeting()` in `apps/web/src/lib/api.ts`, calling the existing `POST /meetings` and returning the created `Meeting`.
- A new page at `apps/web/src/app/meetings/new/page.tsx` with a form for title (text), date/time, and participants (one or more emails).
- A "New meeting" entry point linked from the home page (`apps/web/src/app/page.tsx`), next to or near the existing "Your meetings" list.
- Client-side validation mirroring the server's existing `CreateMeetingDto` rules: non-empty title, a valid ISO 8601 date, and a non-empty list of syntactically valid participant emails.
- On successful creation, redirect to the new meeting's detail page (`/meetings/[id]`), the same page an existing meeting already links to from the home page's list.
- User-facing error feedback for both client-side validation failures and server-side rejections (e.g. malformed request body), shown clearly on the form.
- Session-expiry handling on submit, consistent with every other authenticated mutation already in this app (`handleSessionExpired()`-equivalent: log out, redirect to `/login`).

## Out of scope

- Any backend change — `POST /meetings`, `CreateMeetingDto`, and `CreateMeetingHandler` are used as they exist today; this PRD covers the frontend only.
- Editing or deleting an existing meeting — this iteration only covers creating a new one.
- Validating participant emails against real registered users, checking for duplicate participants, or inviting/notifying participants (e.g. email invites) — the backend only validates email syntax today, and this iteration doesn't add anything beyond that.
- Recurring meetings, meeting duration/end time, meeting descriptions, or any field not already in `CreateMeetingDto`.
- Actually starting or hosting a live video call — this feature only creates the meeting record; joining/hosting is out of scope here.
- Real-time propagation to other already-open browser tabs/sessions — a page reload/refetch of the meetings list is sufficient.
- A modal/dialog-based creation flow — this iteration uses a dedicated page only.

## Technical limitations

- `CreateMeetingDto` (`apps/api/src/meetings/dto/create-meeting.dto.ts`) requires `title` (non-empty string), `date` (ISO 8601 string), and `participants` (array of syntactically valid emails, empty array currently allowed by `@IsArray()` alone — no `@ArrayNotEmpty()`). The frontend's own validation should require at least one participant even though the server doesn't strictly enforce it, per the PRD's acceptance criteria below; a request with zero participants would currently still succeed server-side if it slipped through.
- `organizerId` is taken from the authenticated user's JWT (`request.user.userId`) server-side, not supplied by the client — the form has no organizer field.
- There is no uniqueness or duplicate-meeting check, and no check that `date` isn't in the past — `CreateMeetingHandler` persists whatever valid-shaped request it receives. Out of scope to add either check in this iteration.
- The existing `apps/web/src/lib/api.ts` pattern for authenticated mutations (`updateUsername`, `changePassword`, etc.) funnels errors through `toApiError()` with a `401 -> "Your session has expired. Please sign in again."` override; `createMeeting()` should follow the same pattern for consistency.
- No existing `apps/web/src/app/meetings/new/` route or form component exists today — this is new page/component work, not an extension of `apps/web/src/app/meetings/[id]/page.tsx` (the read-only detail page).

## Acceptance Criteria

- [ ] An authenticated user can navigate to the create-meeting page from a "New meeting" link/button on the home page.
- [ ] An authenticated user can submit a title, date/time, and at least one participant email, and a new meeting is created.
- [ ] On successful creation, the user is redirected to the new meeting's detail page, which shows the submitted title, date, and participants.
- [ ] The home page's meetings list reflects the newly created meeting after a reload/refetch.
- [ ] Submitting with an empty title is rejected client-side with a clear, specific error message, and no request is sent.
- [ ] Submitting with an invalid or empty date is rejected client-side with a clear, specific error message, and no request is sent.
- [ ] Submitting with zero participants, or a participant entry that isn't a syntactically valid email, is rejected client-side with a clear, specific error message, and no request is sent.
- [ ] If the session has expired at submit time, the user is logged out and redirected to `/login`, consistent with the app's other authenticated forms.
- [ ] An unauthenticated visitor navigating to the create-meeting page is redirected to `/login`.
- [ ] e2e test: authenticated user creates a meeting via the form and is redirected to that meeting's detail page showing the correct data.
- [ ] e2e test: submitting the form with an empty title, invalid date, or no participants shows a clear validation error and issues no request.
- [ ] e2e test: an expired session on submit logs the user out and redirects to `/login`.
- [ ] e2e test: an unauthenticated visit to the create-meeting page redirects to `/login`.
