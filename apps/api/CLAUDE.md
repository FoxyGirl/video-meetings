# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the `api` app in the `video-meetings` npm workspaces monorepo (see `../../CLAUDE.md` for the repo-wide picture). It's a NestJS project scaffolded with `@nestjs/cli` (TypeScript, Express platform, Jest).

## Commands

Run from this directory, or from the repo root with `--workspace=api`:

```bash
npm run start:dev              # nest start --watch, http://localhost:3001
npm run start                  # nest start (no watch)
npm run start:debug            # nest start --debug --watch
npm run build                  # nest build -> dist/
npm run start:prod             # node dist/main (run after build)

npm run lint                   # eslint over {src,apps,libs,test} with --fix
npm run typecheck              # tsc --noEmit

npm run test                   # jest (unit tests, *.spec.ts, rootDir: src) - none currently exist; passWithNoTests keeps this green
npm run test:watch
npm run test:cov               # coverage output to ../coverage (i.e. apps/api/coverage)
npm run test:e2e               # jest -c test/jest-e2e.json (test/*.e2e-spec.ts)
npm run test:debug             # jest --runInBand under the node inspector

# run a single e2e file
npx jest -c test/jest-e2e.json auth.e2e-spec.ts
# run a single test by name
npx jest -c test/jest-e2e.json -t "creates a user and returns a JWT"
```

The API listens on `process.env.PORT ?? 3001` (`src/main.ts`) — deliberately not Nest's default 3000, since that port is used by the `web` app when both run together via the root `npm run dev`.

## Database (Prisma)

Data access goes through Prisma ORM 7, talking to the Postgres container from the root `docker-compose.yml` (see `../../CLAUDE.md`).

- `prisma/schema.prisma` defines the models: `User` (`id`, `email` (unique), `password`, `createdAt`) and `Meeting` (`id`, `title`, `date`, `participants` (string array), `organizerId` FK to `User` with `onDelete: Cascade`, `createdAt`). `prisma.config.ts` (repo convention as of Prisma 7 — connection URL no longer lives in the schema file) points Migrate at `DATABASE_URL`.
- The generator (`provider = "prisma-client"`, `moduleFormat = "cjs"`) writes generated client source to `prisma/generated/prisma/` — **gitignored, not committed**. Run `npx prisma generate` (or reinstall — it's wired as a `postinstall` script) after cloning or whenever `schema.prisma` changes.
- `PrismaClient` requires an explicit driver adapter in v7; construct it with `@prisma/adapter-pg`'s `PrismaPg` adapter over `DATABASE_URL`, not a bare `new PrismaClient()`.
- Env: copy `.env.example` to `.env` for the dev database (`video_meetings`). `.env.test` (committed — dummy local credentials only) points at a separate `video_meetings_test` database on the same container, used by e2e tests.
- Migrations: `npm run db:migrate:dev` against the dev DB (creates + applies a migration); apply the same migration to the test DB with `DATABASE_URL=<test-url> npm run db:migrate:deploy`. The test database itself needs to exist first — `docker/postgres-initdb/01-create-test-db.sql` (repo root) creates it automatically on a fresh container volume; for an already-initialized volume, create it once by hand (`docker exec <db-container> psql -U postgres -c "CREATE DATABASE video_meetings_test;"`).
- `PrismaModule` (`src/prisma/`) wraps `PrismaService` (extends `PrismaClient`, connects/disconnects with the Nest lifecycle) and is `@Global()`, so any module can inject `PrismaService` without importing `PrismaModule` itself.

## Auth

`AuthModule` (`src/auth/`) implements registration and login, both driven by the e2e tests in `test/auth.e2e-spec.ts` (written first, per this feature's TDD approach). It follows the CQRS pattern via `@nestjs/cqrs` rather than a conventional service layer — there is no `AuthService`. It owns authorization concerns only (token generation, token verification, credential verification); it does not touch the `User` table directly — that's [User](#user)'s job, reached via `CommandBus`/`QueryBus` rather than direct injection.

- `AuthController` only depends on `CommandBus`/`QueryBus`; it never calls Prisma or business logic directly. `POST /auth/register` dispatches a `RegisterCommand` (`src/auth/commands/`); `POST /auth/login` dispatches a `LoginQuery` (`src/auth/queries/`). Both take `{ email, password }` and both resolve to `{ accessToken: "<jwt>" }` on success.
- `RegisterHandler` (`@CommandHandler`) delegates the actual user creation to `UserModule` by dispatching a `CreateUserCommand` on the injected `CommandBus` (propagates `409 ConflictException` if the email is taken), then signs the JWT from the returned `{ id, email }`.
- `LoginHandler` (`@QueryHandler`) delegates the user lookup to `UserModule` by dispatching a `FindUserByEmailQuery` on the injected `QueryBus`, then verifies the password with `bcrypt.compare` and signs the JWT. `401 UnauthorizedException` for either an unknown email (query returns `null`) or a wrong password — deliberately not distinguished, to avoid leaking which emails are registered.
- Both handlers (plus `CqrsModule` and `UserModule`) are registered as `providers`/`imports` in `AuthModule`; there's no separate "module per handler" — keep new command/query handlers there too as the module grows. `AuthModule` imports `UserModule` purely to put its handlers in the Nest module graph (so `@nestjs/cqrs`'s app-wide handler discovery picks them up) — it never injects anything from `UserModule` directly.
- Request bodies are validated by DTOs (`src/auth/dto/`, `class-validator` decorators, definite-assignment `!` on properties since they're populated by `class-transformer`, not a constructor) enforced through a global `ValidationPipe` registered via the `APP_PIPE` token in `AppModule` — use `APP_PIPE`, not `app.useGlobalPipes()` in `main.ts` alone, since the e2e tests build the Nest app straight from `AppModule` and never run `main.ts`'s bootstrap.
- JWTs are signed by `@nestjs/jwt`'s `JwtModule`, configured with `registerAsync`/`useFactory` (not `register`) specifically so `process.env.JWT_SECRET` is read lazily at Nest's provider-instantiation time rather than at module-import time — a plain `register({ secret: process.env.JWT_SECRET })` would read `undefined` because `AuthModule`'s imports are evaluated before `main.ts`'s `import 'dotenv/config'` has a chance to run when Node resolves the module graph.
- `.env` / `.env.example` / `.env.test` all need a `JWT_SECRET` alongside `DATABASE_URL`.
- `JwtAuthGuard` (`src/auth/guards/jwt-auth.guard.ts`) is a plain `CanActivate`, not `@nestjs/passport` — there's no `passport`/`passport-jwt` dependency in this project, so it extracts the `Bearer` token from the `Authorization` header itself, verifies it via the injected `JwtService`, and sets `request.user` (typed by `AuthenticatedRequest`, `src/auth/interfaces/`) to `{ userId, email }` from the token payload; throws `401` if the header is missing or the token fails verification. `AuthModule` exports both `JwtModule` and `JwtAuthGuard` (alongside importing `AuthModule` itself) so other feature modules can protect their own routes with `@UseGuards(JwtAuthGuard)` and read `request.user` without redefining JWT verification.

## User

`UserModule` (`src/user/`) owns the `User` entity: creating a user and searching for one by email. Like `AuthModule`, it follows the CQRS pattern via `@nestjs/cqrs` — no `UserService`, and no controller (it has no HTTP surface of its own; it's reached only via the shared `CommandBus`/`QueryBus`, currently only from `AuthModule`'s handlers).

- `CreateUserHandler` (`@CommandHandler` for `CreateUserCommand`, `src/user/commands/`) checks for an existing email (`409 ConflictException` if taken), hashes the password with `bcrypt` (10 salt rounds — never store or compare plaintext), creates the `User` row, publishes a `UserCreatedEvent` via `EventBus`, and returns `{ id, email }` (`UserRecord`, `src/user/interfaces/`) — deliberately not the password hash.
- `FindUserByEmailHandler` (`@QueryHandler` for `FindUserByEmailQuery`, `src/user/queries/`) looks a user up by email and returns `{ id, email, password }` (`UserWithCredentials`, `src/user/interfaces/`) or `null` if none exists. It's the one place the password hash leaves `UserModule` — safe because this query is internal-only (never exposed over HTTP), consumed by `AuthModule`'s `LoginHandler` to verify credentials.
- `UserCreatedHandler` (`@EventsHandler`, `src/user/events/`) reacts to `UserCreatedEvent` — currently just an audit log line. This is the extension point for anything that should happen after a user is created (welcome email, analytics, etc.) without bloating `CreateUserHandler`.
- All three handlers (plus `CqrsModule` itself) are registered as `providers` in `UserModule`; keep new command/query/event handlers there too as the module grows.

## Meetings

`MeetingsModule` (`src/meetings/`) implements the meeting CRUD-so-far (create/list/get-by-id) behind `JwtAuthGuard`, driven by `test/meetings.e2e-spec.ts` (written first, same TDD approach as auth). Like `AuthModule`, it follows the CQRS pattern via `@nestjs/cqrs` — no `MeetingsService`.

- `MeetingsController` only depends on `CommandBus`/`QueryBus` plus the current request's `user` (attached by `JwtAuthGuard`, via `@UseGuards(JwtAuthGuard)` on the controller). `POST /meetings` dispatches a `CreateMeetingCommand` (`src/meetings/commands/`); `GET /meetings` dispatches a `GetMeetingsQuery`; `GET /meetings/:id` dispatches a `GetMeetingQuery` (`src/meetings/queries/`). Every command/query carries the authenticated user's id (`organizerId`) alongside the request data — meetings are always scoped to their organizer, never looked up unscoped.
- `CreateMeetingHandler` (`@CommandHandler`) just persists the `Meeting` row via Prisma (`title`, `date`, `participants`, `organizerId`) and returns it — no side effects yet, unlike `RegisterHandler`'s event publish.
- `GetMeetingsHandler` (`@QueryHandler`) lists meetings filtered by `organizerId` only — there's no cross-user visibility.
- `GetMeetingHandler` (`@QueryHandler`) looks a meeting up by `id` **and** `organizerId` together (`findFirst`, not `findUnique` by `id` alone) and throws `404 NotFoundException` if nothing matches. This deliberately makes "exists but belongs to someone else" indistinguishable from "doesn't exist" — the same information-leak avoidance already used by `LoginHandler`'s undifferentiated `401`.
- Both handlers plus `CqrsModule` are registered as `providers` in `MeetingsModule`, which also imports `AuthModule` (to get `JwtAuthGuard` and its `JwtService` dependency into scope) — same one-module structure as `AuthModule`, keep new meeting command/query/event handlers there as it grows.
- Request bodies are validated by `CreateMeetingDto` (`src/meetings/dto/`): `title` required non-empty string, `date` an ISO-8601 string (stored as Prisma `DateTime`), `participants` an array of valid emails (an empty array is allowed — inviting no one is valid).
- `Meeting` (`prisma/schema.prisma`) has an `organizerId` FK to `User` with `onDelete: Cascade`, so deleting a user cleans up their meetings automatically.

## Architecture

- `app.module.ts` is the root module, importing `PrismaModule`, `AuthModule`, and `MeetingsModule` (no root-level controller/service — the default scaffolded `AppController`/`AppService` `GET /` "Hello World!" endpoint was unused by the `web` app and has been removed). `main.ts` bootstraps via `NestFactory.create(AppModule)`, after `import 'dotenv/config'` (must be the first import, so env vars are set before anything else in the module graph loads). Add further features as their own Nest modules under `src/` and import them into `AppModule`.
- `tsconfig.json` extends the repo's `../../tsconfig.base.json`. Note this app intentionally does **not** use TypeScript's master `strict: true` — it sets individual flags (`strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, plus `forceConsistentCasingInFileNames` from the base) because Nest's decorator-heavy DI patterns don't pair well with the full strict set (e.g. `strictPropertyInitialization`). Don't casually turn on full `strict` mode without checking DI-injected class properties still compile.
- `tsconfig.build.json` extends `tsconfig.json` and excludes `test/**` and `*spec.ts` — this is what `nest build` actually uses (see `nest-cli.json`'s implicit build config), so `npm run build` won't pull in test files even though `tsconfig.json` itself has no `include`/`exclude`.
- `eslint.config.mjs` is a flat config built on `typescript-eslint`'s `recommendedTypeChecked` (type-aware linting via `parserOptions.projectService`) plus `eslint-plugin-prettier/recommended`. `@typescript-eslint/no-explicit-any` is turned off and `no-floating-promises`/`no-unsafe-argument` are downgraded to warnings — expect `any` to be allowed and floating promises to warn rather than error. There is no local `.prettierrc`; Prettier formatting comes from the repo root config.
- Tests: unit specs sit next to the code they test (`*.spec.ts`, Jest config inlined in `package.json` with `rootDir: "src"`); e2e specs live in `test/*.e2e-spec.ts` under their own Jest config (`test/jest-e2e.json`). e2e tests boot the real `AppModule` (via `@nestjs/testing` + `supertest`) against the real Postgres test database (`.env.test`), not mocks — `auth.e2e-spec.ts` cleans the `User` table in `beforeEach` via a Prisma client of its own, while `meetings.e2e-spec.ts` isolates itself with a uniquely-emailed registered user per test instead (there's no `Meeting` table cleanup — a fresh user per test has no meetings to collide with). Because multiple spec files mutate the same shared test database, `test:e2e` runs Jest with `--runInBand` — without it, Jest's default per-file worker parallelism caused real, reproducible cross-file flakiness (one spec's `User` cleanup racing another spec's assertions). The `test:e2e` script also runs Jest with `NODE_OPTIONS=--experimental-vm-modules` (via `cross-env` for cross-platform support) because Prisma 7's generated client uses a WASM query compiler loaded through a dynamic `import()`, which Jest's CJS runtime otherwise rejects. `jest-e2e.json` also maps `.js`-suffixed relative imports back to their `.ts` source (`moduleNameMapper`) since the generated client's own imports use `.js` extensions per Node's ESM-style resolution even in `cjs` output mode.
