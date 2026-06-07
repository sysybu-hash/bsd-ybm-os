import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
/** פורט E2E — לא מ-NEXTAUTH_URL (3000 ב-.env.local) כדי לא להתנגש עם `npm run dev`. */
function resolvePlaywrightPort(): string {
  const fromDev = process.env.PLAYWRIGHT_DEV_PORT?.trim();
  if (fromDev) return fromDev;
  const fromBase = process.env.PLAYWRIGHT_BASE_URL?.trim();
  if (fromBase) {
    try {
      const p = new URL(fromBase).port;
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

/** Keep NextAuth callbacks + session cookies on the same origin Playwright hits. */
function buildE2eAuthEnv(base: string): Record<string, string> {
  const url = base.replace(/\/$/, "");
  return {
    NEXTAUTH_URL: url,
    AUTH_URL: url,
    NEXT_PUBLIC_SITE_URL: url,
    /** Dev allowlists in .env.local must not block seeded E2E users. */
    LOGIN_ALLOWLIST_EMAILS: "",
    ALLOWED_LOGIN_EMAILS: "",
  };
}


/** Playwright webServer.env requires string values only. */
function processEnvStrings(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
const e2eAuthEnv = buildE2eAuthEnv(baseURL);
Object.assign(process.env, e2eAuthEnv);

/** CI: build runs in the workflow before E2E — only start the server here. */
const defaultWebCommand = process.env.CI
  ? `npx next start -p ${playwrightPort}`
  : `npx next dev -p ${playwrightPort}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: "./e2e/global-setup.ts",
  timeout: process.env.CI ? 120_000 : 60_000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Parallel workers in CI — balance speed vs Next server load under Playwright webServer. */
  workers: process.env.CI ? 2 : undefined,
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
        command: process.env.PLAYWRIGHT_WEB_COMMAND ?? defaultWebCommand,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 180_000,
        env: { ...processEnvStrings(process.env), ...e2eAuthEnv },
      },
});
