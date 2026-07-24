# Research: Meeting recording file upload, storage, and display

**Plan:** @docs/plan-meeting-file-upload-storage-and-display.md
**PRD:** @docs/prd-meeting-file-upload-storage-and-display.md
**Date:** 2026-07-23

This is a technology-choice document, not a plan. It answers _how_ to implement each phase of the plan given what's already in this repo (NestJS 11 + CQRS on Express, Prisma 7, Next.js App Router web client), and calls out the specific library APIs, config, and pitfalls relevant to this codebase.

## Current state relevant to this feature

- `@nestjs/platform-express@11.1.28` is already a direct dependency of `apps/api`, and it carries `multer@2.2.0` as its own transitive dependency (hoisted to the repo root `node_modules`) — confirmed with `npm ls multer`. Nothing needs to be installed for basic disk-storage upload to work, but see [Dependencies to add explicitly](#dependencies-to-add-explicitly) below for why you should still add it directly.
- `@nestjs/common@11` ships `StreamableFile` (`file-stream/streamable-file.d.ts`) — the built-in mechanism for streaming a `Readable` back through a controller with correct headers. No extra package needed for download.
- No file-type/magic-byte sniffing library exists in the repo. The PRD's validation table is extension + declared `Content-Type` only (no mention of magic-byte sniffing), which matches what's actually feasible without adding a new dependency — see [Validation strategy](#validation-strategy).
- `AppModule` currently registers `ValidationPipe` via `APP_PIPE` (per `apps/api/CLAUDE.md`) and there's no existing `multipart/form-data` handling anywhere — `class-validator` DTOs today only ever validate JSON bodies.
- The `Meeting` model (`prisma/schema.prisma`) has no file columns yet; `MeetingsModule` is a single-module CQRS setup (no service layer) that the file endpoints should extend, not duplicate.

## Phase 3–4 (backend): storage, validation, streaming

### Framework choice: `FileInterceptor` + `diskStorage`, not raw `multer` middleware

Nest wraps multer through `@nestjs/platform-express`'s `FileInterceptor('file', options)` (`platform-express/multer/interceptors/file.interceptor.d.ts`), applied per-route with `@UseInterceptors`. This is the right layer here rather than mounting multer as raw Express middleware, because:

- it integrates with Nest's existing pipe/guard/interceptor pipeline, so `JwtAuthGuard` still runs first, consistent with every other route in `MeetingsController`;
- the uploaded file is exposed as `@UploadedFile() file: Express.Multer.File` and can be validated in the same command/handler flow the rest of the codebase already uses (`CommandBus`/`GetMeetingHandler`-style organizer scoping), rather than a bespoke middleware branch.

```ts
@Post(':id/file')
@UseGuards(JwtAuthGuard)
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: UPLOAD_DIR,
      filename: (_req, _file, cb) => cb(null, randomUUID()), // never trust the client's original name for the on-disk name
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: multerFileFilter, // first-pass extension/MIME check, see below
  }),
)
uploadFile(
  @Param('id') id: string,
  @UploadedFile() file: Express.Multer.File,
  @Req() request: AuthenticatedRequest,
) {
  return this.commandBus.execute(
    new UploadMeetingFileCommand(id, request.user.userId, file),
  );
}
```

Key config decisions this implies:

- **`storage: diskStorage(...)`**, not the default in-memory storage. Multer's default (no `storage` option) buffers the whole file in RAM as a `Buffer` — fine for small JSON-like payloads but wrong for recording files that can be tens/hundreds of MB; `diskStorage` streams straight to disk. `Express.Multer.File.path`/`.filename` are only populated when `diskStorage` is used (memory storage instead populates `.buffer`), so the handler downstream must assume `diskStorage`'s file shape.
- **Generate the on-disk filename server-side** (e.g. `randomUUID()`, optionally suffixed with the original extension for readability during debugging) rather than reusing `file.originalname`. This is both a path-traversal defense (an original name like `../../etc/passwd` or one containing `%2e%2e` must never reach the filesystem layer) and avoids collisions between meetings. The _original_ filename is preserved separately as metadata (`originalName` in the Prisma model) purely for display/download `Content-Disposition`, never as a path component.
- **`limits.fileSize`** on the interceptor is multer's own hard cutoff — it aborts the stream mid-upload once exceeded, so oversized files never fully land on disk even transiently. This must be set generously above the PRD's max size for the interceptor to even receive the request; the actual accept/reject decision can still additionally be re-checked in the handler for a clean, specific error message (multer's own overflow throws a fairly generic Multer error).
- **`fileFilter`** on multer runs before any bytes are written and can reject by extension/MIME cheaply, but see below — it should be a first-pass filter only, with the authoritative check still done in the command handler.

### Body size limit at the HTTP layer

The PRD's "Technical limitations" section flags that Nest/Express have no raised body-size limit today. Two independent limits interact here and both need raising for this route specifically, not globally:

1. **Express's own body parser limit** (`express.json()`/`urlencoded()` default ~100kb) doesn't apply to multipart bodies parsed by multer — multer parses `multipart/form-data` itself via `busboy`, bypassing Express's JSON/urlencoded parsers entirely. So no global body-size config is needed for this to work; multer's own `limits.fileSize` (above) is the actual gate.
2. **Nest's underlying HTTP server** (Node's default `http.Server`) has no body-size cap of its own beyond what Express/multer enforce, so nothing extra is needed at the `main.ts`/adapter level either. The one config knob that does matter repo-wide: if a global `express.json({ limit })` is ever added later for unrelated JSON endpoints, don't let that be confused with this route's multipart limit — they're independent code paths.

Net effect: **no changes to `main.ts` are needed**; the size limit lives entirely in the `FileInterceptor(...)` options for the upload route, which is also the most self-documenting place for it (colocated with the route it constrains, discoverable by future readers of the plan's Phase 3 rather than buried in bootstrap code).

### Validation strategy

The PRD requires checking **both** extension and declared MIME type, rejecting a mismatch (e.g. `.mp4` + non-video MIME). Two layers, both needed:

1. **`fileFilter` (multer, pre-write)** — cheap rejection using `file.originalname`'s extension and `file.mimetype` (the client-declared `Content-Type` header for that form part) against the PRD's accepted-types table. This runs before any disk I/O, so a request calling itself `virus.exe` never touches the filesystem.
2. **Handler-level re-check (post-`fileFilter`, in `UploadMeetingFileHandler`)** — re-validate the same extension/MIME pairing explicitly (don't rely solely on `fileFilter`'s silent `cb(null, false)` rejection, which by default causes Nest to proceed with `file` being `undefined` rather than throwing — the handler must itself throw a typed `BadRequestException` with a specific message per the PRD's "clear error message" requirement, distinguishing "bad extension" / "bad MIME type" / "extension-MIME mismatch" / "too large").

**What this repo should _not_ add:** a magic-byte/content-sniffing library (e.g. `file-type`). The PRD's accepted-types table is explicitly extension + declared-MIME only, and out-of-scope explicitly excludes virus/malware scanning (deep content inspection is adjacent to that concern). Adding sniffing would be scope creep beyond what's specified and beyond what the e2e tests (driven by the PRD's table) will assert. If this system later needs to defend against a malicious client lying about both extension and `Content-Type` (trivial to spoof from a raw HTTP client, not just a browser), that's a deliberate follow-up, not part of this iteration — worth flagging to the user but not silently added.

Validate against a single shared constant (extension → MIME map) rather than duplicating the table as parallel arrays — this is also the object Phase 5's client-side validation should mirror in `apps/web`, since the PRD explicitly asks for client-side rules that mirror the server-side ones. Since `apps/web` and `apps/api` don't share a package (per the root `CLAUDE.md`), this table is necessarily duplicated once on each side; keep both copies literally identical (same extensions/MIME strings, same order) and note the duplication with a comment linking to the other file so a future edit to one is easy to catch as needing the other. A shared package is overkill for one small constant table given the repo's explicit no-shared-code structure.

### Persisting metadata + replace behavior

Prisma migration adds to `Meeting` (nullable — a meeting starts with no file):

```prisma
model Meeting {
  // ...existing fields
  fileOriginalName String?
  filePath         String?   // path relative to the upload dir, not the originalName
  fileMimeType     String?
  fileSize         Int?
  fileUploadedAt   DateTime?
}
```

Nullable columns (rather than a separate `MeetingFile` table) fit the PRD's explicit "one file per meeting, always replaced, no version history" scope — a 1:1 optional relation modeled as inline columns is simpler than a joined table for a field set this small, and avoids an unnecessary join on every `GET /meetings/:id` read. Revisit only if a future PRD reintroduces multiple files per meeting.

**Replace-on-reupload** ordering matters for crash-safety: write the new file to disk first (under a fresh generated name), then update the Prisma row, then delete the old file from disk — in that order. If the process dies between steps, this leaves at worst an orphaned file on disk (recoverable by a future cleanup pass) rather than a Prisma row pointing at a path that no longer exists (which would 500 the download endpoint). Doing "delete old, then write new" risks a window where the meeting has no file at all if the write step fails.

### Download endpoint: `StreamableFile`, not manual `res.sendFile`

```ts
@Get(':id/file/download')
async download(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
  const meta = await this.queryBus.execute(new GetMeetingFileQuery(id));
  const stream = createReadStream(meta.filePath);
  res.set({
    'Content-Type': meta.mimeType,
    'Content-Disposition': `attachment; filename="${encodeRFC5987(meta.originalName)}"`,
  });
  return new StreamableFile(stream);
}
```

- `StreamableFile` (built into `@nestjs/common`, confirmed present at this version) wraps a `Readable` and handles piping/backpressure/`Content-Length` correctly — no need for `res.sendFile` or manually piping and managing header timing.
- `@Res({ passthrough: true })` (not bare `@Res()`) is required so Nest still applies its own response handling around the `StreamableFile` return value — bare `@Res()` opts the route out of Nest's response pipeline entirely, which would silently break `StreamableFile`.
- **`Content-Disposition` filename must be encoded**, not interpolated raw — a stored `originalName` containing `"` or non-ASCII characters (e.g. `Réunion café.mp4`) would otherwise produce a malformed header or an HTTP response-splitting risk. Use the RFC 5987 `filename*=UTF-8''...` form (or a library like `content-disposition` if precise correctness matters) rather than naive string interpolation.
- The download route's authorization is "any authenticated user" per the PRD (Phase 4) — it reuses the Phase 1 unscoped-by-id lookup, only `JwtAuthGuard` gates it, no organizer check.

### Storage path and `.gitignore`

Store outside `src/` (e.g. `apps/api/uploads/` or a path from an env var like `UPLOAD_DIR`, defaulting to a repo-relative directory for dev). Whichever directory is chosen must be added to `apps/api/.gitignore` per the plan's Phase 3 task — confirm the directory is created at bootstrap (`fs.mkdirSync(dir, { recursive: true })`, e.g. in `main.ts` or the module's `onModuleInit`) since a fresh clone won't have it and multer's `diskStorage` does not create missing directories itself, it errors instead.

### Testing multipart uploads in the existing e2e/supertest setup

`test/meetings.e2e-spec.ts` already uses `supertest` against a real `AppModule` + real Postgres test DB (no mocks, per the repo's established e2e convention). Supertest supports multipart natively via `.attach()`:

```ts
await request(app.getHttpServer())
  .post(`/meetings/${meetingId}/file`)
  .set('Authorization', `Bearer ${token}`)
  .attach('file', Buffer.from('fake mp4 bytes'), {
    filename: 'recording.mp4',
    contentType: 'video/mp4',
  })
  .expect(201);
```

No new test dependency is needed — `supertest` (already a devDependency) handles multipart encoding. For the disallowed-type/oversized-file cases, generate the in-memory buffer with `Buffer.alloc(size)` rather than checking in a real fixture file, keeping the test self-contained and fast. After each upload test, clean up written files from the test upload directory (afterEach/afterAll `fs.rm`) so repeated test runs don't accumulate files — mirrors the existing e2e convention of cleaning up owned rows between tests (`auth.e2e-spec.ts`'s `User` cleanup).

### Dependencies to add explicitly

Even though `multer` is already present transitively via `@nestjs/platform-express`, add it (and `@types/multer`) as **direct** `dependencies`/`devDependencies` in `apps/api/package.json`:

- the code will `import { diskStorage } from 'multer'` and use `Express.Multer.File` types directly — depending on an undeclared transitive package is fragile (a future `@nestjs/platform-express` upgrade could change or drop its multer dependency version without warning, silently breaking this code);
- this matches Nest's own file-upload documentation, which lists `@types/multer` as a devDependency to install alongside `@nestjs/platform-express` for typed `Express.Multer.File`.

No other new runtime dependency is required for Phases 3–4.

## Phase 5–6 (frontend): upload UI, progress, download

### HTTP client: Axios repo-wide (decision — supersedes plain `fetch`)

**Decision:** `apps/web` adopts `axios` for all API calls, not just upload — chosen specifically because Axios's browser build still uses `XMLHttpRequest` under the hood, so `onUploadProgress` gives the same real byte-level progress event XHR would, without hand-rolling an XHR wrapper. This is a deliberate, explicit choice to add a new dependency and touch every existing call in `apps/web/src/lib/api.ts` (`registerUser`, `loginUser`, `getMeetings`, `getMeeting`), not just the new upload/download calls — consistency of one HTTP client across the file was preferred over keeping `fetch` for the pre-existing calls and carving out just upload as an exception.

What this changes versus the fetch-based `api.ts` today:

- **New dependency:** `axios` in `apps/web/package.json` (`dependencies`, not `devDependencies` — it ships in the client bundle).
- **A shared `axios` instance with a request interceptor**, not per-call `fetch(...)` — e.g. `apps/web/src/lib/http.ts`:

  ```ts
  import axios from 'axios';
  import { getAuthSnapshot } from './auth-store';
  import { API_URL } from './api';

  export const http = axios.create({ baseURL: API_URL });

  http.interceptors.request.use((config) => {
    const auth = getAuthSnapshot();
    if (auth) {
      config.headers.Authorization = `Bearer ${auth.accessToken}`;
    }
    return config;
  });
  ```

  This works specifically because `getAuthSnapshot()` (`apps/web/src/lib/auth-store.ts`) is already a plain synchronous function backed by a module-level cache + `localStorage` — it's not React state, so the interceptor can call it directly at request time without needing a hook or context threaded through `api.ts`. Every `api.ts` function that currently takes an `accessToken` parameter (`getMeetings`, and the new file endpoints) drops that parameter entirely once callers go through `http` — the token is attached uniformly, so call sites in components stop needing to read `useAuth()` just to pass the token down. `login`/`register` themselves stay accessToken-free requests as they are today (no token exists yet to attach).
  - One thing to decide but not required for this PRD: a response interceptor could catch a `401` from any call and trigger `logout()` from `auth-store` centrally (today each call site handles its own "session expired" message). Worth flagging as a natural follow-on now that there's a single interceptor point, but out of scope for this feature — don't bundle it into this change unless asked.

- **Error handling shape changes.** `fetch` never rejects on a non-2xx status (`res.ok` must be checked manually, which is what today's `registerUser`/`loginUser`/`getMeetings` all do); Axios does the opposite — it _rejects_ on non-2xx by default, as an `AxiosError` with `.response.status`/`.response.data`. Every existing `if (!res.ok) { ... throw new ApiError(...) }` block becomes a `try { ... } catch (err) { if (isAxiosError(err)) { ... throw new ApiError(msg, err.response?.status ?? 0) } }` (or a shared helper that wraps this once and is reused by all calls, rather than repeating the `try`/`catch` per function). This is a real behavioral migration, not a drop-in rename — worth doing as its own small pass across the existing three calls before or alongside adding the new file ones, so the whole file ends up in one consistent style rather than half-migrated.
- **Response parsing** no longer needs `res.json() as Promise<T>` — Axios parses JSON automatically and types the result via `axios.get<T>(...)`/`axios.post<T>(...)` generics.

Upload, using the shared instance:

```ts
export function uploadMeetingFile(
  meetingId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<FileMetadata> {
  const form = new FormData();
  form.append('file', file);
  return http
    .post<FileMetadata>(`/meetings/${meetingId}/file`, form, {
      onUploadProgress: (e) => {
        if (e.total) onProgress((e.loaded / e.total) * 100);
      },
    })
    .then((res) => res.data);
}
```

Notes specific to this call:

- **Do not manually set `Content-Type: multipart/form-data`** when passing a `FormData` body to Axios — same rule as raw `fetch`/XHR: the browser needs to set the header itself so it includes the multipart boundary. Axios detects a `FormData` body in the browser and lets the boundary be set automatically; overriding `Content-Type` yourself breaks server-side parsing.
- `onUploadProgress`'s event shape (`{ loaded, total }`) is Axios's own normalized progress event, not a raw XHR `ProgressEvent` — `e.total` can still be `undefined` if the server/browser can't compute content length, so guard it the same way `lengthComputable` would with raw XHR.
- This is still a genuine deviation in _kind_ of call (multipart vs. JSON) from the rest of `api.ts`, even once everything is on Axios — worth keeping the file upload function visually separate (e.g. grouped with the other file endpoints) rather than implying it's interchangeable with the JSON calls.

### `FormData`, not JSON, for the request body

The upload call must send `multipart/form-data` via a browser `FormData` object (field name `'file'`, matching the server's `FileInterceptor('file', ...)`), not `JSON.stringify`.

### Download: plain anchor tag doesn't work here — auth header required

Because the download endpoint requires a Bearer token (per the PRD, download is "authenticated" not "public"), a plain `<a href={downloadUrl} download>` won't carry the `Authorization` header — browsers don't attach custom headers to normal navigations. With Axios, the fit is `responseType: 'blob'`:

```ts
export async function downloadMeetingFile(meetingId: string, fileName: string) {
  const res = await http.get(`/meetings/${meetingId}/file/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
```

This is the same "fetch the bytes with the auth header, then trigger a client-side save via an object URL" pattern as the plain-`fetch` version, just using Axios's `responseType: 'blob'` instead of manually calling `.blob()` on a `Response` — no behavioral difference, purely which client issues the request. A short-lived signed download URL / cookie session would avoid the blob round-trip but is a materially bigger auth change (this repo's auth is header-based JWT only) and out of proportion to what Phase 6 needs.

### Client-side validation mirrors the server table

Phase 5 asks for client-side extension/MIME/size validation before submit. Implement this against a `File` object's `.name` (extension) and `.type` (MIME, browser-inferred from the file, same caveat as server-side — a client can lie, but this is UX-level fast-fail, not a security boundary; the server remains the authority per Phase 3). Keep the accepted-types table as a single exported constant in `apps/web/src/lib/` so the upload component and any future display logic (e.g. showing accepted extensions in the UI) read from one place, rather than inlining the same list into JSX.

## Cross-cutting notes

- **Nothing here changes the CQRS/module shape** the codebase already uses: upload is a `CommandHandler`, delete is a `CommandHandler`, metadata-fetch and download are `QueryHandler`s, all registered in `MeetingsModule` alongside the existing handlers — no new module, no service layer, consistent with `apps/api/CLAUDE.md`'s stated conventions.
- **Organizer-scoping** for upload/delete should reuse the exact `findFirst({ id, organizerId })` shape `GetMeetingHandler` used _before_ Phase 1's change (per the plan's Phase 3 task) — don't invent a new ownership-check pattern.
- **No new infra** (Docker service, env var beyond an optional `UPLOAD_DIR`) is required; local disk storage needs nothing the `docker-compose.yml` Postgres setup doesn't already provide alongside it.
