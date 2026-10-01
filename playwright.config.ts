import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

// Credentials live in .env.test, which is gitignored. Loading them here means
// `npm run test:e2e` works without exporting variables by hand.
config({ path: '.env.test', quiet: true })
config({ path: '.env.local', quiet: true, override: false })

/**
 * E2E configuration.
 *
 * These tests drive a real browser against a real Supabase project, because the
 * things most likely to break here are exactly the things a mock would hide:
 * cookie session refresh in proxy.ts, RLS on a real connection, Server Action
 * round-trips, and money formatting off the wire.
 *
 * Requirements:
 *   - the dev server running (`npm run dev`)
 *   - .env.test with a throwaway account's credentials (see .env.test.example)
 *
 * Cleanup runs as a script with the service-role key, never as an HTTP route.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Shared account; parallel tests would race on data
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
