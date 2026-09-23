import { existsSync } from "fs";

import { env } from "@/lib/env";

/**
 * One Chromium launcher for everything that needs a browser at runtime.
 *
 * The PDF exporters each grew their own copy of this, identical down to the
 * Hebrew error message, and the 3D renderer would have made three. They differ
 * in one thing only — whether the page needs WebGL — so that is the argument.
 */

const isVercel = Boolean(env.VERCEL);

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--font-render-hinting=none",
];

/**
 * What a GL context needs on a machine that has no GPU to give it.
 *
 * On Vercel these come from @sparticuz/chromium itself: its `args` getter adds
 * --use-gl=angle, --use-angle=swiftshader and --enable-unsafe-swiftshader
 * whenever its graphics mode is on, so we only have to make sure it is on.
 * Locally, headless Chrome refuses a software context without the unsafe flag,
 * and asking for it costs nothing on a machine that does have a GPU.
 */
const LOCAL_WEBGL_ARGS = ["--enable-unsafe-swiftshader"];

function findLocalChromeExecutable(): string | null {
  const candidates = [
    env.PUPPETEER_EXECUTABLE_PATH,
    env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((p): p is string => Boolean(p));
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

export type ChromiumLaunchOptions = {
  /**
   * The page will draw with WebGL.
   *
   * On Vercel this turns on @sparticuz/chromium's graphics mode, which is what
   * unpacks the SwiftShader libraries beside the binary. It must be set before
   * executablePath() is awaited, because that call is what unpacks them.
   */
  webgl?: boolean;
  viewport?: { width: number; height: number };
};

/** A headless Chromium: @sparticuz's on Vercel, the machine's own locally. */
export async function launchChromium(options?: ChromiumLaunchOptions) {
  const puppeteer = await import("puppeteer-core");
  const defaultViewport = options?.viewport ?? { width: 1280, height: 720 };

  if (isVercel) {
    const chromium = (await import("@sparticuz/chromium")).default;
    // Only ever switched on. The PDF exporters have always run with whatever
    // the package defaults to, and a render must not change how they launch.
    if (options?.webgl) chromium.setGraphicsMode = true;
    return puppeteer.default.launch({
      args: [...chromium.args, ...LAUNCH_ARGS],
      defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath = findLocalChromeExecutable();
  if (!executablePath) {
    throw new Error(
      "לא נמצא Chrome לייצוא PDF. התקינו Google Chrome או הגדירו PUPPETEER_EXECUTABLE_PATH.",
    );
  }
  return puppeteer.default.launch({
    executablePath,
    headless: true,
    args: options?.webgl ? [...LAUNCH_ARGS, ...LOCAL_WEBGL_ARGS] : LAUNCH_ARGS,
    defaultViewport,
  });
}
