"use client";

import { useEffect, useRef } from "react";

const PROJECT_MUTATION_EVENT = "os:project-mutation";

export type ProjectMutationDetail = {
  projectId: string;
  timestamp: number;
};

/** Broadcast after project-scoped POST/PATCH/DELETE (tasks, budget, etc.). */
export function emitProjectMutation(projectId: string): void {
  if (typeof window === "undefined" || !projectId.trim()) return;

  const event = new CustomEvent<ProjectMutationDetail>(PROJECT_MUTATION_EVENT, {
    detail: { projectId, timestamp: Date.now() },
  });
  window.dispatchEvent(event);
}

/** Re-run `onUpdate` when another widget mutates the same project. */
export function useProjectSync(projectId: string | undefined, onUpdate: () => void): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!projectId) return;

    const handleMutation = (event: Event) => {
      const customEvent = event as CustomEvent<ProjectMutationDetail>;
      if (customEvent.detail?.projectId === projectId) {
        onUpdateRef.current();
      }
    };

    window.addEventListener(PROJECT_MUTATION_EVENT, handleMutation);
    return () => window.removeEventListener(PROJECT_MUTATION_EVENT, handleMutation);
  }, [projectId]);
}
