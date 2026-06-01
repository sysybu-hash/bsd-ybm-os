"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { saveAppDataAction } from "@/app/actions/app-builder";
import DynamicComposerRenderer from "@/components/AppBuilder/DynamicComposerRenderer";
import DynamicDashboardRenderer from "@/components/AppBuilder/DynamicDashboardRenderer";
import DynamicFullAppRenderer from "@/components/AppBuilder/DynamicFullAppRenderer";
import FieldInput from "@/components/AppBuilder/FieldInput";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

type FormTableUiSchema = Extract<AppBuilderUiSchema, { type: "form" | "table" }>;

type Props = {
  uiSchema: AppBuilderUiSchema;
  schemaId?: string;
  readOnly?: boolean;
  onSaved?: (id: string) => void;
};

type FormTableProps = Omit<Props, "uiSchema"> & { uiSchema: FormTableUiSchema };

function FormTableDynamicRenderer({ uiSchema, schemaId, readOnly, onSaved }: FormTableProps) {
  const { t, dir } = useI18n();
  const prefix = "workspaceWidgets.appBuilder";

  const initialValues = useMemo(() => {
    const map: Record<string, string> = {};
    for (const field of uiSchema.fields) {
      map[field.name] = field.type === "checkbox" ? "false" : "";
    }
    return map;
  }, [uiSchema.fields]);

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
    if (readOnly || !schemaId) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const formData: Record<string, unknown> = {};
      for (const field of uiSchema.fields) {
        const raw = values[field.name] ?? "";
        if (field.type === "checkbox") {
          formData[field.name] = raw === "true";
        } else {
          formData[field.name] = raw;
        }
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

  if (uiSchema.type === "table") {
    return (
      <div dir={dir} className="flex flex-col gap-4 p-4">
        {uiSchema.title ? (
          <h3 className="text-base font-semibold text-[color:var(--foreground-main)]">{uiSchema.title}</h3>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60">
                {uiSchema.fields.map((field) => (
                  <th key={field.name} className="px-3 py-2 text-start font-medium">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {uiSchema.fields.map((field) => (
                  <td key={field.name} className="px-3 py-2 text-[color:var(--foreground-muted)]">
                    —
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[color:var(--foreground-muted)]">{t(`${prefix}.tablePreviewHint`)}</p>
      </div>
    );
  }

  return (
    <form dir={dir} onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 p-4">
      {uiSchema.title ? (
        <h3 className="text-base font-semibold text-[color:var(--foreground-main)]">{uiSchema.title}</h3>
      ) : null}

      {uiSchema.fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <label htmlFor={`app-builder-${field.name}`} className="text-sm font-medium text-[color:var(--foreground-main)]">
            {field.label}
            {field.required ? <span className="text-red-400"> *</span> : null}
          </label>
          <FieldInput
            field={field}
            value={values[field.name] ?? ""}
            onChange={onChange}
            disabled={readOnly || busy}
          />
        </div>
      ))}

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-emerald-400" role="status">
          {success}
        </p>
      ) : null}

      {!readOnly && schemaId ? (
        <button
          type="submit"
          disabled={busy}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {t(`${prefix}.submitForm`)}
        </button>
      ) : !schemaId ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">{t(`${prefix}.saveSchemaFirst`)}</p>
      ) : null}
    </form>
  );
}

export default function DynamicRenderer(props: Props) {
  if (props.uiSchema.type === "dashboard") {
    return <DynamicDashboardRenderer schema={props.uiSchema} />;
  }
  if (props.uiSchema.type === "composer") {
    return <DynamicComposerRenderer schema={props.uiSchema} {...props} />;
  }
  if (props.uiSchema.type === "full_app") {
    const { uiSchema, schemaId, readOnly, onSaved } = props;
    return (
      <DynamicFullAppRenderer
        uiSchema={uiSchema}
        schemaId={schemaId}
        readOnly={readOnly}
        onSaved={onSaved}
      />
    );
  }
  return <FormTableDynamicRenderer {...props} uiSchema={props.uiSchema} />;
}
