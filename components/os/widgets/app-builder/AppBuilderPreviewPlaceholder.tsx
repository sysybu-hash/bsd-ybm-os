"use client";

import { Sparkles } from "lucide-react";

type Props = {
  title: string;
  subtitle: string;
  className?: string;
};

/**
 * The App Builder's empty preview state, rendered natively.
 *
 * It used to be produced by `buildSandpackPlaceholder` as a string of JSX and
 * handed to `DynamicSandpackRenderer`, which mounts a sandboxed iframe that
 * loads React, ReactDOM, Tailwind and `@babel/standalone` from CDNs to compile
 * it. Measured on production, that is **622KB of Babel alone** — the single
 * largest asset anywhere on the site — downloaded to draw an icon and two lines
 * of text, before the user has generated anything.
 *
 * Nothing here needs compiling, so nothing here needs the sandbox. The iframe is
 * now mounted only once there is real generated code to run.
 *
 * The old version also hard-coded slate hex values, so the placeholder stayed
 * light while the rest of the workspace was dark.
 */
export function AppBuilderPreviewPlaceholder({ title, subtitle, className = "" }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-8 text-center ${className}`}
    >
      <Sparkles
        size={40}
        className="text-[color:var(--foreground-muted)] opacity-50"
        aria-hidden
      />
      <p className="m-0 text-[15px] font-semibold text-[color:var(--foreground-main)]">{title}</p>
      <p className="m-0 max-w-[280px] text-[13px] leading-relaxed text-[color:var(--foreground-muted)]">
        {subtitle}
      </p>
    </div>
  );
}
