import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const REPO_ROOT = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
