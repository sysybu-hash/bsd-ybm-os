"use client";

import React, { useId } from "react";
import { Search, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

type OsInputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Shared text/number/date input — wraps `.quiet-input` for one consistent focus ring (`--brand-accent`). */
export const OsInput = React.forwardRef<HTMLInputElement, OsInputProps>(function OsInput(
  { className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`quiet-input w-full rounded-lg px-3 py-2 text-sm ${className}`.trim()}
      {...rest}
    />
  );
});

type OsSearchInputProps = Omit<OsInputProps, "type" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Accessible label — required since the field usually has no visible <label>. */
  label: string;
};

/** Search input with a leading icon and a clear button, logical padding for RTL/LTR. */
export const OsSearchInput = React.forwardRef<HTMLInputElement, OsSearchInputProps>(
  function OsSearchInput({ value, onChange, label, className = "", placeholder, ...rest }, ref) {
    const id = useId();
    const { t } = useI18n();
    return (
      <div className={`relative ${className}`.trim()}>
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 my-auto start-3 text-[color:var(--foreground-muted)]"
        />
        <input
          ref={ref}
          id={id}
          type="search"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? label}
          className="quiet-input w-full rounded-lg py-2 pe-8 ps-9 text-sm"
          {...rest}
        />
        {value ? (
          <button
            type="button"
            aria-label={t("common.clear")}
            onClick={() => onChange("")}
            className="absolute inset-y-0 my-auto end-2 flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
          >
            <X size={12} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  },
);
