"use client";

import type { AppBuilderField } from "@/lib/validation/schemas/app-builder";

type Props = {
  field: AppBuilderField;
  value: string;
  onChange: (name: string, value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export default function FieldInput({ field, value, onChange, disabled, idPrefix = "app-builder" }: Props) {
  const inputClass =
    "w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm text-[color:var(--foreground-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-60";

  const id = `${idPrefix}-${field.name}`;

  if (field.type === "textarea") {
    return (
      <textarea
        id={id}
        name={field.name}
        required={field.required}
        disabled={disabled}
        rows={3}
        value={value}
        onChange={(e) => onChange(field.name, e.target.value)}
        className={inputClass}
      />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <select
        id={id}
        name={field.name}
        required={field.required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(field.name, e.target.value)}
        className={inputClass}
      >
        <option value="">—</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <input
        id={id}
        name={field.name}
        type="checkbox"
        disabled={disabled}
        checked={value === "true"}
        onChange={(e) => onChange(field.name, e.target.checked ? "true" : "false")}
        className="h-4 w-4 rounded border-[color:var(--border-main)]"
      />
    );
  }

  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

  return (
    <input
      id={id}
      name={field.name}
      type={inputType}
      required={field.required}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(field.name, e.target.value)}
      className={inputClass}
    />
  );
}
