"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { listAppDataAction, saveAppDataAction } from "@/app/actions/app-builder";
import FieldInput from "@/components/AppBuilder/FieldInput";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { AppBuilderField, AppBuilderFullAppUI } from "@/lib/validation/schemas/app-builder";

type Props = {
  uiSchema: AppBuilderFullAppUI;
  schemaId?: string;
  readOnly?: boolean;
  onSaved?: (id: string) => void;
};

type DataRow = { id: string; values: Record<string, unknown> };

function formatCellValue(
  field: AppBuilderField,
  raw: unknown,
  t: (key: string) => string,
  prefix: string,
): string {
  if (raw === null || raw === undefined || raw === "") {
    return "—";
  }
  if (field.type === "checkbox") {
    const on = raw === true || raw === "true";
    return on ? t(`${prefix}.cellYes`) : t(`${prefix}.cellNo`);
  }
  if (typeof raw === "boolean") {
    return raw ? t(`${prefix}.cellYes`) : t(`${prefix}.cellNo`);
  }
  return String(raw);
}

export default function DynamicFullAppRenderer({ uiSchema, schemaId, readOnly, onSaved }: Props) {
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
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"add" | "records">("add");

  const loadData = useCallback(async () => {
    if (!schemaId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listAppDataAction(schemaId);
      if (!result.ok) {
        setError(result.error ?? t(`${prefix}.loadRecordsError`));
        setRows([]);
        return;
      }
      const next: DataRow[] = result.rows.map((row) => {
        const data =
          row.data && typeof row.data === "object" && !Array.isArray(row.data)
            ? (row.data as Record<string, unknown>)
            : {};
        return { id: row.id, values: data };
      });
      setRows(next);
    } catch {
      setError(t(`${prefix}.loadRecordsError`));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [schemaId, prefix, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const onChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || !schemaId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const formData: Record<string, unknown> = {};
      for (const field of uiSchema.fields) {
        const raw = values[field.name] ?? "";
        formData[field.name] = field.type === "checkbox" ? raw === "true" : raw;
      }

      const result = await saveAppDataAction({ schemaId, formData });
      if (!result.ok) {
        setError(result.error ?? t(`${prefix}.saveDataError`));
        return;
      }
      setSuccess(t(`${prefix}.saveDataSuccess`));
      setValues(initialValues);
      onSaved?.(result.id);
      await loadData();
      setMobilePane("records");
    } catch {
      setError(t(`${prefix}.saveDataError`));
    } finally {
      setSubmitting(false);
    }
  };

  const formSection = (
    <section className="flex flex-col rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-4">
      <h3 className="text-sm font-bold text-[color:var(--foreground-main)]">{t(`${prefix}.addRecord`)}</h3>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 flex flex-col gap-3">
        {uiSchema.fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label
              htmlFor={`full-app-${field.name}`}
              className="text-sm font-medium text-[color:var(--foreground-main)]"
            >
              {field.label}
              {field.required ? <span className="text-red-400"> *</span> : null}
            </label>
            <FieldInput
              field={field}
              idPrefix="full-app"
              value={values[field.name] ?? ""}
              onChange={onChange}
              disabled={readOnly || submitting || !schemaId}
            />
          </div>
        ))}

        {!schemaId ? (
          <p className="text-xs text-[color:var(--foreground-muted)]">{t(`${prefix}.saveSchemaFirst`)}</p>
        ) : null}

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
            disabled={submitting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t(`${prefix}.submitForm`)}
          </button>
        ) : null}
      </form>
    </section>
  );

  const tableSection = (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[color:var(--foreground-main)]">{t(`${prefix}.recordsTitle`)}</h3>
        {schemaId ? (
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-elevated)] disabled:opacity-60"
            aria-label={t(`${prefix}.refreshRecords`)}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            {t(`${prefix}.refreshRecords`)}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[color:var(--foreground-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t(`${prefix}.recordsLoading`)}
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={uiSchema.fields.length}
                      className="px-3 py-6 text-center text-[color:var(--foreground-muted)]"
                    >
                      {schemaId ? t(`${prefix}.recordsEmpty`) : t(`${prefix}.recordsPreviewEmpty`)}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[color:var(--border-main)]/60 hover:bg-[color:var(--surface-soft)]/50"
                    >
                      {uiSchema.fields.map((field) => (
                        <td key={field.name} className="px-3 py-2 text-[color:var(--foreground-main)]">
                          {formatCellValue(field, row.values[field.name], t, prefix)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div dir={dir} className="flex h-full min-h-0 flex-col gap-4 p-4">
      <header className="shrink-0">
        <h2 className="text-lg font-bold text-[color:var(--foreground-main)]">{uiSchema.title}</h2>
        {uiSchema.description ? (
          <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{uiSchema.description}</p>
        ) : null}
      </header>

      <div
        className="flex shrink-0 gap-1 md:hidden"
        role="tablist"
        aria-label={t(`${prefix}.fullAppPaneAria`)}
      >
        {(["add", "records"] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={mobilePane === pane}
            onClick={() => setMobilePane(pane)}
            className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-bold transition ${
              mobilePane === pane
                ? "bg-indigo-600 text-white"
                : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"
            }`}
          >
            {pane === "add" ? t(`${prefix}.addRecord`) : t(`${prefix}.recordsTitle`)}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`lg:col-span-1 ${mobilePane === "records" ? "hidden md:block" : ""}`}>
          {formSection}
        </div>
        <div
          className={`flex min-h-[200px] flex-col lg:col-span-2 ${mobilePane === "add" ? "hidden md:flex" : ""}`}
        >
          {tableSection}
        </div>
      </div>
    </div>
  );
}
