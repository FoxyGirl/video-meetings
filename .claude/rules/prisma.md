---
globs: '**/*.prisma'
---

# Prisma Rules

- UUID for all ids: @id @default(uuid())
- Always add createdAt and updatedAt: `createdAt DateTime @default(now())`, `updatedAt DateTime @default(now()) @updatedAt` (auto-managed, not a plain field you bump by hand). Keep the `@default(now())` on updatedAt: adding the column to a non-empty table needs a DB-level default to backfill existing rows, and declaring it in the schema too keeps `prisma migrate diff` empty instead of drifting.
- Enum values in UPPER_CASE
- Relationships via @relation with an explicit name only when a model has more than one relation to the same target model (disambiguation); a single relation between two models doesn't need one
- Indexes on foreign keys via @@index (not automatic on Postgres — the FK constraint alone doesn't create one)
