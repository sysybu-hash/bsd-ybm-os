"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { saveAppDataAction } from "@/app/actions/app-builder";
import DynamicDashboardRenderer from "@/components/AppBuilder/DynamicDashboardRenderer";
import FieldInput from "@/components/AppBuilder/FieldInput";
import { useAutomationRunnerContext } from "@/components/os/AutomationRunnerContext";
import { useI18n } from "@/components/os/system/I18nProvider";
import type {
  AppBuilderComposerUI,
  AppBuilderField,
  ComposerAction,
} from "@/lib/validation/schemas/app-builder";
import { normalizeAutomationIntent } from "@/lib/os-automations/catalog";

type Props = {
  schema: AppBuilderComposerUI;
  schemaId?: string;
  readOnly?: boolean;
  onSaved?: (id: string) => void;
};

function ComposerActionsBlock({
  title,
  actions,
}: {
  title?: string;
  actions: ComposerAction[];
}) {
  const automationCtx = useAutomationRunnerContext();
  const { t } = useI18n();
  const prefix = "workspaceWidgets.appBuilder";

  const runAction = useCallback(
    async (action: ComposerAction) => {
      const intent = normalizeAutomationIntent(action.intent);
      if (!intent) {
        toast.error(t(`${prefix}.invalidAction`));
        return;
      }
      if (!automationCtx?.runActions) {
        toast.error(t(`${prefix}.actionRunnerUnavailable`));
        return;
      }
      const results = await automationCtx.runActions([{ intent, params: action.params }]);
      const fail = results.find((r) => !r.ok);
      if (fail?.message) toast.error(fail.message);
    },
    [automationCtx, t, prefix],
  );

  return (
    <section className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-4">
      {title ? (
        <h4 className="mb-3 text-sm font-semibold text-[color:var(--foreground-main)]">{title}</h4>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => void runAction(action)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden />
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function DynamicComposerRenderer({ schema, schemaId, readOnly, onSaved }: Props) {
  const { t, dir } = useI18n();
  const prefix = "workspaceWidgets.appBuilder";

  const formBlock = schema.blocks.find((block) => block.kind === "form");
  const formFields = formBlock?.kind === "form" ? formBlock.fields : null;

  const initialValues = useMemo(() => {
    const map: Record<string, string> = {};
    if (!formFields) return map;
    for (const field of formFields) {
      map[field.name] = field.type === "checkbox" ? "false" : "";
    }
    return map;
  }, [formFields]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || !schemaId || !formFields) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const formData: Record<string, unknown> = {};
      for (const field of formFields) {
        const raw = values[field.name] ?? "";
        formData[field.name] = field.type === "checkbox" ? raw === "true" : raw;
      }

      const result = await saveAppDataAction({ schemaId, formData });
      if (!result.ok) {
        setError(result.error ?? t(`${prefix}.saveDataError`));
        return;
      }
      setSuccess(t(`${prefix}.saveDataSuccess`));
      onSaved?.(result.id);
    } catch {
      setError(t(`${prefix}.saveDataError`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir={dir} className="flex flex-col gap-6 p-4">
      <header>
        <h2 className="text-lg font-bold text-[color:var(--foreground-main)]">{schema.title}</h2>
        {schema.description ? (
          <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{schema.description}</p>
        ) : null}
      </header>

      {schema.blocks.map((block) => {
        if (block.kind === "dashboard") {
          return (
            <section key={block.id}>
              <DynamicDashboardRenderer
                schema={{
                  type: "dashboard",
                  title: block.title ?? schema.title,
                  components: block.components,
                }}
              />
            </section>
          );
        }

        if (block.kind === "text") {
          return (
            <section
              key={block.id}
              className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30 p-4"
            >
              {block.title ? (
                <h4 className="mb-2 text-sm font-semibold text-[color:var(--foreground-main)]">{block.title}</h4>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--foreground-muted)]">
                {block.body}
              </p>
            </section>
          );
        }

        if (block.kind === "actions") {
          return <ComposerActionsBlock key={block.id} title={block.title} actions={block.actions} />;
        }

        if (block.kind === "form") {
          return (
            <form
              key={block.id}
              onSubmit={(e) => void handleSubmit(e)}
              className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30 p-4"
            >
              {block.title ? (
                <h4 className="mb-3 text-sm font-semibold text-[color:var(--foreground-main)]">{block.title}</h4>
              ) : null}
              <div className="flex flex-col gap-3">
                {block.fields.map((field: AppBuilderField) => (
                  <div key={field.name} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`composer-${field.name}`}
                      className="text-sm font-medium text-[color:var(--foreground-main)]"
                    >
                      {field.label}
                      {field.required ? <span className="text-red-400"> *</span> : null}
                    </label>
                    <FieldInput
                      field={field}
                      idPrefix="composer"
                      value={values[field.name] ?? ""}
                      onChange={onChange}
                      disabled={readOnly || busy}
                    />
                  </div>
                ))}
              </div>
              {error ? (
                <p className="mt-3 text-sm text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="mt-3 text-sm text-emerald-400" role="status">
                  {success}
                </p>
              ) : null}
              {!readOnly && schemaId ? (
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {t(`${prefix}.submitForm`)}
                </button>
              ) : !schemaId ? (
                <p className="mt-3 text-xs text-[color:var(--foreground-muted)]">{t(`${prefix}.saveSchemaFirst`)}</p>
              ) : null}
            </form>
          );
        }

        return null;
      })}
    </div>
  );
}
