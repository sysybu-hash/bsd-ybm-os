import "server-only";
import { cookies, headers } from "next/headers";
import { isVmbHost, VMB_BRAND } from "@/lib/vmb/brand";
import { readVmbSession, VMB_SESSION_COOKIE, type VmbSessionUser } from "@/lib/vmb/session";
import { createLogger } from "@/lib/logger";

const log = createLogger("vmb-page-session");

/** The signed-in VisualModuBuild user for a server component, or null. */
export async function getVmbPageUser(): Promise<VmbSessionUser | null> {
  const jar = await cookies();
  try {
    return await readVmbSession(jar.get(VMB_SESSION_COOKIE)?.value);
  } catch (err: unknown) {
    // A page treats an unreadable session as signed out rather than failing.
    log.error("vmb_page_session_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Visible path for a VMB page: "/app" on the product host, "/vmb/app" elsewhere. */
export async function vmbServerPath(path: string): Promise<string> {
  const h = await headers();
  return isVmbHost(h.get("x-forwarded-host") ?? h.get("host")) ? path : `${VMB_BRAND.pathPrefix}${path}`;
}
