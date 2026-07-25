"use client";

import React from "react";

/** Bordered settings group with an icon heading and optional subtitle. */
export function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--border-main)] p-4">
      <header className="mb-3">
        <h3 className="flex items-center gap-2 text-sm font-black">
          {icon}
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-[color:var(--foreground-muted)]">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Label + hint on the start edge, checkbox on the end edge. */
export function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-[color:var(--border-main)] px-3 py-2.5 ${
        disabled ? "pointer-events-none opacity-45" : ""
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        {hint ? (
          <span className="block text-xs text-[color:var(--foreground-muted)]">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** Numeric field with a clamped range and a hint line. */
export function NumberField({
  label,
  hint,
  value,
  min,
  max,
  fallback,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  fallback: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs font-bold">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          const next = Number.isFinite(raw) && e.target.value !== "" ? raw : fallback;
          onChange(Math.min(max, Math.max(min, next)));
        }}
        className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] p-2 text-sm font-normal"
      />
      <span className="mt-1 block font-normal text-[color:var(--foreground-muted)]">{hint}</span>
    </label>
  );
}

/** Select field with a hint line. */
export function SelectField({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs font-bold">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] p-2 text-sm font-normal"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block font-normal text-[color:var(--foreground-muted)]">{hint}</span>
    </label>
  );
}
