"use client";

import { useInsertionEffect, useRef, type MutableRefObject } from "react";

/**
 * A ref that always holds the most recent `value`, for reading from callbacks
 * and effects that must not be torn down when that value changes.
 *
 * This replaces the hand-written form seven call sites were each repeating:
 *
 *   const onFooRef = useRef(onFoo);
 *   onFooRef.current = onFoo;   // <- assignment in the render body
 *
 * The pattern is right; the assignment site is not. Writing a ref while
 * rendering makes the component impure — React may render without committing,
 * and under the React Compiler it may re-run a render it has already done, so
 * the ref can end up holding a value from a render that never reached the
 * screen. `react-hooks/refs` flags it for exactly that reason.
 *
 * `useInsertionEffect` is the sanctioned place: it runs on commit, before
 * layout effects and before any event handler can fire, so every reader that
 * legitimately wants the latest value still sees it.
 *
 * **Do not read the result during render.** It intentionally lags by one commit
 * there, which is the whole point — if you need a value while rendering, use
 * the value itself rather than a ref to it.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);

  useInsertionEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
