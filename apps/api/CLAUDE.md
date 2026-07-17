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

npm run test                   # jest (unit tests, *.spec.ts, rootDir: src)
npm run test:watch
npm run test:cov               # coverage output to ../coverage (i.e. apps/api/coverage)
npm run test:e2e               # jest -c test/jest-e2e.json (test/*.e2e-spec.ts)
npm run test:debug             # jest --runInBand under the node inspector

# run a single test file
npx jest app.controller.spec.ts
# run a single test by name
npx jest -t "should return"
```

The API listens on `process.env.PORT ?? 3001` (`src/main.ts`) — deliberately not Nest's default 3000, since that port is used by the `web` app when both run together via the root `npm run dev`.

## Database (Prisma)

Data access goes through Prisma ORM 7, talking to the Postgres container from the root `docker-compose.yml` (see `../../CLAUDE.md`).

- `prisma/schema.prisma` defines the models (currently just `User`: `id`, `email` (unique), `password`, `createdAt`). `prisma.config.ts` (repo convention as of Prisma 7 — connection URL no longer lives in the schema file) points Migrate at `DATABASE_URL`.
- The generator (`provider = "prisma-client"`, `moduleFormat = "cjs"`) writes generated client source to `prisma/generated/prisma/` — **gitignored, not committed**. Run `npx prisma generate` (or reinstall — it's wired as a `postinstall` script) after cloning or whenever `schema.prisma` changes.
- `PrismaClient` requires an explicit driver adapter in v7; construct it with `@prisma/adapter-pg`'s `PrismaPg` adapter over `DATABASE_URL`, not a bare `new PrismaClient()`.
- Env: copy `.env.example` to `.env` for the dev database (`video_meetings`). `.env.test` (committed — dummy local credentials only) points at a separate `video_meetings_test` database on the same container, used by e2e tests.
- Migrations: `npm run db:migrate:dev` against the dev DB (creates + applies a migration); apply the same migration to the test DB with `DATABASE_URL=<test-url> npm run db:migrate:deploy`. The test database itself needs to exist first — `docker/postgres-initdb/01-create-test-db.sql` (repo root) creates it automatically on a fresh container volume; for an already-initialized volume, create it once by hand (`docker exec <db-container> psql -U postgres -c "CREATE DATABASE video_meetings_test;"`).

## Architecture

- Standard Nest module/controller/service triad in `src/`: `app.module.ts` is the root module, `app.controller.ts` / `app.service.ts` the default controller and service. `main.ts` bootstraps via `NestFactory.create(AppModule)`. There is currently a single module — add new features as their own Nest modules under `src/` and import them into `AppModule` as the app grows. An `AuthModule` (register/login) is planned but not yet implemented — see `test/auth.e2e-spec.ts`, written test-first and currently red (routes don't exist yet).
- `tsconfig.json` extends the repo's `../../tsconfig.base.json`. Note this app intentionally does **not** use TypeScript's master `strict: true` — it sets individual flags (`strictNullChecks`, `noImplicitAny`, `strictBindCallApply`, plus `forceConsistentCasingInFileNames` from the base) because Nest's decorator-heavy DI patterns don't pair well with the full strict set (e.g. `strictPropertyInitialization`). Don't casually turn on full `strict` mode without checking DI-injected class properties still compile.
- `tsconfig.build.json` extends `tsconfig.json` and excludes `test/**` and `*spec.ts` — this is what `nest build` actually uses (see `nest-cli.json`'s implicit build config), so `npm run build` won't pull in test files even though `tsconfig.json` itself has no `include`/`exclude`.
- `eslint.config.mjs` is a flat config built on `typescript-eslint`'s `recommendedTypeChecked` (type-aware linting via `parserOptions.projectService`) plus `eslint-plugin-prettier/recommended`. `@typescript-eslint/no-explicit-any` is turned off and `no-floating-promises`/`no-unsafe-argument` are downgraded to warnings — expect `any` to be allowed and floating promises to warn rather than error. There is no local `.prettierrc`; Prettier formatting comes from the repo root config.
- Tests: unit specs sit next to the code they test (`*.spec.ts`, Jest config inlined in `package.json` with `rootDir: "src"`); e2e specs live in `test/*.e2e-spec.ts` under their own Jest config (`test/jest-e2e.json`). e2e tests boot the real `AppModule` (via `@nestjs/testing` + `supertest`) against the real Postgres test database (`.env.test`), not mocks — they clean the `User` table in `beforeEach` via a Prisma client of their own. The `test:e2e` script runs Jest with `NODE_OPTIONS=--experimental-vm-modules` (via `cross-env` for cross-platform support) because Prisma 7's generated client uses a WASM query compiler loaded through a dynamic `import()`, which Jest's CJS runtime otherwise rejects. `jest-e2e.json` also maps `.js`-suffixed relative imports back to their `.ts` source (`moduleNameMapper`) since the generated client's own imports use `.js` extensions per Node's ESM-style resolution even in `cjs` output mode.
