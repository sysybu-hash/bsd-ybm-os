import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
/** פורט אחיד ל־webServer ול־baseURL (מניעת 3330 בשרת מול 3001 ב-health-check). */
function resolvePlaywrightPort(): string {
  const fromDev = process.env.PLAYWRIGHT_DEV_PORT?.trim();
  if (fromDev) return fromDev;
  const auth = process.env.NEXTAUTH_URL?.trim() ?? process.env.AUTH_URL?.trim();
  if (auth) {
    try {
      const p = new URL(auth).port;
      if (p) return p;
    } catch {
      /* fall through */
    }
  }
  return "3001";
}

const playwrightPort = resolvePlaywrightPort();

/** Must match NEXTAUTH_URL host in CI (127.0.0.1) or session cookies are not sent. */
function resolvePlaywrightHost(): string {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    try {
      return new URL(process.env.PLAYWRIGHT_BASE_URL).hostname;
    } catch {
      /* fall through */
    }
  }
  for (const key of ["NEXTAUTH_URL", "AUTH_URL"] as const) {
    const raw = process.env[key];
    if (!raw) continue;
    try {
      return new URL(raw).hostname;
    } catch {
      /* try next */
    }
  }
  return process.env.CI ? "127.0.0.1" : "localhost";
}

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://${resolvePlaywrightHost()}:${playwrightPort}`;

export default defineConfig({
  testDir: './e2e',
  timeout: process.env.CI ? 120_000 : 60_000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_WEB_COMMAND ?? `npx next start -p ${playwrightPort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 180_000,
        /* Omit `env` so the child inherits process.env; Next.js loads .env* from the project root. */
      },
});
