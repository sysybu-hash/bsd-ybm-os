/**
 * Shared visual tokens for the redesigned auth experience (login + register).
 * Centralised so the panel, fields and buttons stay consistent.
 */

/** Modern text input — tall touch target, rounded, focus ring. */
export const AUTH_INPUT =
  "h-12 w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 text-sm text-[color:var(--foreground-main)] outline-none transition placeholder:text-[color:var(--foreground-muted)]/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25";

/** Input wrapper that hosts a leading icon + a full-width field. */
export const AUTH_FIELD_WRAP =
  "flex items-center gap-2.5 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3.5 transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/25";

/** Bare input used inside AUTH_FIELD_WRAP (no border of its own). */
export const AUTH_FIELD_INPUT =
  "h-12 w-full min-w-0 flex-1 border-none bg-transparent text-sm text-[color:var(--foreground-main)] outline-none placeholder:text-[color:var(--foreground-muted)]/70";

/** Primary CTA — gradient, rounded, full width. */
export const AUTH_BTN_PRIMARY =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 px-5 text-sm font-bold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 active:scale-[0.99] disabled:opacity-60";

/** Secondary / neutral button. */
export const AUTH_BTN_SECONDARY =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-5 text-sm font-bold text-[color:var(--foreground-main)] shadow-sm transition hover:bg-[color:var(--surface-soft)] active:scale-[0.99] disabled:opacity-60";

/** Selectable option card (register wizard choices). */
export const AUTH_OPTION_CARD =
  "rounded-xl border p-3.5 text-start text-sm transition hover:bg-[color:var(--surface-card)]";
export const AUTH_OPTION_CARD_ACTIVE =
  "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30";
export const AUTH_OPTION_CARD_IDLE = "border-[color:var(--border-main)]";

/** "or" divider row. */
export const AUTH_DIVIDER_ROW = "relative flex items-center gap-3 py-0.5";
export const AUTH_DIVIDER_LINE = "h-px flex-1 bg-[color:var(--border-main)]";
export const AUTH_DIVIDER_LABEL = "text-xs font-bold text-[color:var(--foreground-muted)]";
