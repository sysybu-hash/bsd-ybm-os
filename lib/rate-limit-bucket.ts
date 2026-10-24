/**
 * The route a request counts against under the default limit: its path, with
 * ids folded to ":id" so that one row's URL is not a bucket of its own.
 *
 * The default used to be one bucket for every route a user calls. A workspace
 * opens a dozen widgets at once, each calling its own routes, and they spent
 * the 200 together: the nightly E2E, four browsers on one account, had the
 * office-expenses list refused with 429 and the page showed "loading failed".
 */
export function rateLimitRouteBucket(pathname: string): string {
  return pathname
    .split("/")
    .map((part) =>
      /^\d+$/.test(part) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part) ||
      /^c[a-z0-9]{20,}$/.test(part) ||
      /^[0-9a-f]{24,}$/i.test(part)
        ? ":id"
        : part,
    )
    .join("/");
}
