import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const REPO_ROOT = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 1 retry locally (not just CI's 2): the webServer block below starts a
  // fresh `next dev` when nothing's already listening on :3000 (e.g. a
  // pre-push run with no `npm run dev` already up), and Next's dev server
  // compiles each route on-demand on its first hit — the first test to
  // navigate to a given route can take several seconds longer than every
  // later hit of that same route. A single retry absorbs that one-off cold
  // compile without silently hiding a genuinely broken test, which would
  // still fail identically on the retry.
  retries: process.env.CI ? 2 : 1,
  // This is the *default* run's worker count (see apps/web/package.json's
  // `test:e2e` script for the actual two-pass invocation). It no longer
  // needs to be forced to 1 locally: the one spec that needed isolation
  // (meeting-transcription.spec.ts, real CPU-bound local Whisper
  // inference) is tagged `@heavy` and run in its own, always-serial,
  // second pass instead — see that script for why.
  workers: process.env.CI ? 1 : undefined,
  // Above the 5s default specifically for the same cold-compile reason —
  // an assertion racing a route's first-ever compile (e.g. toHaveURL right
  // after a client-side navigation to a not-yet-compiled route) needs more
  // than 5s of headroom under a freshly-started dev server.
  expect: { timeout: 10_000 },
  reporter: 'html',
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Starts both dev servers if they aren't already running (e.g. when this
  // suite runs from the pre-push hook rather than alongside `npm run dev`);
  // reuses them otherwise. Postgres itself is not started here — same
  // prerequisite as apps/api's own e2e suite — since spinning up/tearing
  // down the docker-compose db per run would race with apps/api's e2e tests
  // using the same container.
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:api',
      cwd: REPO_ROOT,
      // GET /meetings exists but requires auth, so it 401s instead of
      // 404ing — enough for Playwright to consider the server "up".
      url: 'http://localhost:3001/meetings',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
