# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the `web` app in the `video-meetings` npm workspaces monorepo (see `../../CLAUDE.md` for the repo-wide picture). It's a Next.js App Router project scaffolded with `create-next-app` (TypeScript, Tailwind CSS v4, ESLint, `src/` directory, `@/*` import alias to `src/*`).

## Commands

Run from this directory, or from the repo root with `--workspace=web`:

```bash
npm run dev             # next dev (Turbopack), http://localhost:3000
npm run build           # next build (production build)
npm run start           # next start (serve the production build)
npm run lint            # eslint (flat config, no path args — lints the whole project)
npm run typecheck       # tsc --noEmit
```

There is no test script/framework configured for this app yet.

## Architecture

- App Router lives under `src/app`. `layout.tsx` is the root layout, `page.tsx` the home route, `globals.css` the Tailwind entry point.
- `tsconfig.json` extends the repo's `../../tsconfig.base.json` and adds Next-specific compiler options (`bundler` module resolution, `jsx: react-jsx`, the `next` TS plugin, and the `.next/types` includes) — don't remove the `extends` when regenerating this file.
- `eslint.config.mjs` composes `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`, then `eslint-config-prettier` to disable any rules that conflict with the repo's shared Prettier config (`../../.prettierrc`). There is no local `.prettierrc` — formatting is controlled entirely from the repo root.
- Styling is Tailwind CSS v4 via `@tailwindcss/postcss` (see `postcss.config.mjs`); there's no `tailwind.config.*` file since v4 configures via CSS (`globals.css`) rather than a JS config.

## UI changes must be visually tested

Any change that affects the UI (component markup, styling, layout, theming, interactive behavior) must be visually verified before the task is considered complete:

1. Run the app and view the change in a browser (e.g. via Playwright) rather than relying on type checking or lint alone.
2. Verify the change with the `ui-ux-pro-max` skill.

Do not mark a UI task done until both steps have been performed.
