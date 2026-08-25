"use client";

import { useSyncExternalStore } from "react";

/**
 * Read a boolean that only the browser can answer — `localStorage`, a UA sniff,
 * the presence of an API — without writing state from an effect.
 *
 * The server (and the hydration pass) sees `serverValue`; the first client
 * render after hydration sees `read()`. That is the same two-step the
 * `useState(false)` + `useEffect(() => setX(read()))` pair produced, minus the
 * state write that `react-hooks/set-state-in-effect` objects to.
 *
 * `read` must be **deterministic and cheap**: React calls it on every render and
 * warns if two consecutive calls disagree. That is fine for a storage lookup or
 * a feature test, and wrong for anything that samples time or randomness.
 *
 * There is deliberately no subscription — the value is re-read on render but
 * nothing pushes a change. Use it for a value that is read once and then owned
 * by local state (a banner that is dismissed, a sidebar that is toggled), not
 * for one that another tab or component can change underneath you.
 */
const subscribe = () => () => {};

export function useClientFlag(read: () => boolean, serverValue = false): boolean {
  return useSyncExternalStore(subscribe, read, () => serverValue);
}
