"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` while rendering on the server and during hydration, `true` afterwards.
 *
 * This replaces the `useState(false)` + `useEffect(() => setMounted(true), [])`
 * pair that eight components were each spelling out. The behaviour is the same
 * — one render as `false`, then a render as `true` once the client is live —
 * but expressing it through `useSyncExternalStore` means no state is written
 * from an effect, which is what `react-hooks/set-state-in-effect` objects to.
 *
 * `subscribe` returns an unsubscribe that does nothing on purpose: the value
 * never changes again after hydration, so there is nothing to listen to. React
 * still needs a subscribe function, and it must be stable across renders or the
 * store resubscribes on every one.
 *
 * Use this to gate anything that cannot exist server-side — `document.body`
 * portals, `window` measurements, locale-dependent clocks — where rendering the
 * real value on the server would produce a hydration mismatch.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useIsMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
