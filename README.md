# video-meetings

Handle video meetings

## Monorepo structure

npm workspaces monorepo with two apps:

- `apps/web` — Next.js (App Router, TypeScript, Tailwind CSS, ESLint)
- `apps/api` — NestJS (TypeScript, ESLint, Jest)

## Getting started

```bash
npm install
```

## Scripts (run from the repo root)

| Script                                    | Description                                             |
| ----------------------------------------- | ------------------------------------------------------- |
| `npm run dev`                             | Run web (`:3000`) and api (`:3001` by default) together |
| `npm run dev:web` / `npm run dev:api`     | Run a single app in dev mode                            |
| `npm run build`                           | Build both apps                                         |
| `npm run start`                           | Start both apps in production mode (after building)     |
| `npm run lint`                            | Lint both apps                                          |
| `npm run typecheck`                       | Type-check both apps                                    |
| `npm run test`                            | Run tests in both apps                                  |
| `npm run format` / `npm run format:check` | Format / check formatting across the repo with Prettier |

Each app also has its own scripts — see `apps/web/package.json` and `apps/api/package.json` — runnable via `npm run <script> --workspace=web` or `--workspace=api`.

## Tooling

- **TypeScript** — shared base config at `tsconfig.base.json`, extended by each app
- **ESLint** — per-app flat config (`eslint-config-next` for web, `typescript-eslint` for api), both wired through `eslint-config-prettier`
- **Prettier** — single shared config at the repo root (`.prettierrc`)
- **Husky + lint-staged** — pre-commit hook lints and formats staged files
