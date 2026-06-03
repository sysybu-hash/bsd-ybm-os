"use client";

import { useCallback, useState } from "react";

export interface CodeHistory {
  /** The code at the current cursor, or null when history is empty. */
  current: string | null;
  /** Whether an undo is possible. */
  canUndo: boolean;
  /** Whether a redo is possible. */
  canRedo: boolean;
  /** 1-based index of the current version (0 when empty). */
  index: number;
  /** Total number of versions held. */
  total: number;
  /** Push a new version, discarding any redo branch ahead of the cursor. */
  push: (code: string) => void;
  /** Step back one version (no-op at the start). */
  undo: () => void;
  /** Step forward one version (no-op at the end). */
  redo: () => void;
  /** Clear all history (used when loading a saved app with no code). */
  reset: () => void;
}

/**
 * Linear undo/redo history for AI-generated code versions.
 *
 * Pushing a new version after undoing discards the "future" branch, matching
 * the familiar editor behaviour. Used by the App Builder so a generation that
 * makes things worse can be reverted.
 */
export function useCodeHistory(): CodeHistory {
  const [versions, setVersions] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);

  const push = useCallback((code: string) => {
    setVersions((prev) => [...prev.slice(0, cursor + 1), code]);
    setCursor((i) => i + 1);
  }, [cursor]);

  const undo = useCallback(() => {
    setCursor((i) => Math.max(0, i - 1));
  }, []);

  const redo = useCallback(() => {
    setCursor((i) => Math.min(versions.length - 1, i + 1));
  }, [versions.length]);

  const reset = useCallback(() => {
    setVersions([]);
    setCursor(-1);
  }, []);

  return {
    current: cursor >= 0 ? (versions[cursor] ?? null) : null,
    canUndo: cursor > 0,
    canRedo: cursor >= 0 && cursor < versions.length - 1,
    index: cursor + 1,
    total: versions.length,
    push,
    undo,
    redo,
    reset,
  };
}
