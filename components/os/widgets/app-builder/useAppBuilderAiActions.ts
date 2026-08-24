"use client";

import { useCallback, useState } from "react";
import { submitAppIdeaAction } from "@/app/actions/app-ideas";
import { isLikelyReactComponent } from "@/lib/app-builder/jsx-preview-utils";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

type Options = {
  t: (key: string, vars?: Record<string, string>) => string;
  prefix: string;
  locale: string;
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
  /** Push regenerated JSX into the editor's undo history. */
  onCode: (jsxCode: string) => void;
  /** Replace the editor's schema when the model returns one instead of code. */
  onSchema: (schema: AppBuilderUiSchema) => void;
  /** Both success paths flip the mobile layout over to the preview pane. */
  onPreviewReady: () => void;
};

/**
 * The two flows that talk to the AI builder route and the community idea pool,
 * split out of useAppBuilder. Each owns only its own busy flag; everything it
 * changes in the editor goes through an explicit callback, so the boundary is
 * visible rather than a shared pile of setters.
 */
export function useAppBuilderAiActions({
  t,
  prefix,
  locale,
  onError,
  onSuccess,
  onCode,
  onSchema,
  onPreviewReady,
}: Options) {
  const [regenerating, setRegenerating] = useState(false);
  const [sharingIdea, setSharingIdea] = useState(false);

  /** Regenerates JSX from the currently-loaded uiSchema + name via the AI chat route. */
  const handleRegenerate = useCallback(
    async (schema: AppBuilderUiSchema, name: string) => {
      setRegenerating(true);
      onError(null);
      try {
        const res = await fetch("/api/ai-builder/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale,
            currentUiSchema: schema,
            messages: [{ role: "user", content: t(`${prefix}.regeneratePrompt`, { name }) }],
          }),
        });
        const data = (await res.json()) as {
          jsxCode?: string;
          uiSchema?: AppBuilderUiSchema;
          error?: string;
        };
        const jsxCode = data.jsxCode?.trim();
        if (jsxCode && isLikelyReactComponent(jsxCode)) {
          onCode(jsxCode);
          onPreviewReady();
        } else if (data.uiSchema) {
          onSchema(data.uiSchema);
          onPreviewReady();
        } else {
          onError(data.error ?? t(`${prefix}.generateError`));
        }
      } catch {
        onError(t(`${prefix}.loadSchemaError`));
      } finally {
        setRegenerating(false);
      }
    },
    [locale, onCode, onError, onPreviewReady, onSchema, prefix, t],
  );

  /** Shares the currently-loaded saved app to the community ideas pool. */
  const handleShareNow = useCallback(
    async (appName: string, uiSchema: AppBuilderUiSchema | null) => {
      if (!uiSchema || !appName.trim()) return;
      setSharingIdea(true);
      try {
        const res = await submitAppIdeaAction({
          appName: appName.trim(),
          appType: uiSchema.type,
          uiSchema,
        });
        if (res.ok) {
          onSuccess(t(`${prefix}.shareIdeaSuccess`));
        } else {
          onError(res.error ?? t(`${prefix}.saveSchemaError`));
        }
      } catch {
        onError(t(`${prefix}.saveSchemaError`));
      } finally {
        setSharingIdea(false);
      }
    },
    [onError, onSuccess, prefix, t],
  );

  return { regenerating, sharingIdea, handleRegenerate, handleShareNow };
}
