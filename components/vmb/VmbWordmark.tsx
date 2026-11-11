import { VMB_BRAND } from "@/lib/vmb/brand";

/** Mark: a plan corner with a dimension tick — the product's precision idea in 20px. */
export function VmbMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--vmb-ink)" />
      <path d="M8 20 V8 H20" fill="none" stroke="var(--vmb-bg)" strokeWidth="2.6" strokeLinecap="square" />
      <path d="M12 23 H20 M12 21.5 V24.5 M20 21.5 V24.5" stroke="var(--vmb-accent)" strokeWidth="1.2" />
      <circle cx="20" cy="20" r="2" fill="var(--vmb-accent)" />
    </svg>
  );
}

/** The brand name with its accent segment coloured (both from lib/vmb/brand). */
function wordParts() {
  const { name, accentPart } = VMB_BRAND;
  const at = accentPart ? name.indexOf(accentPart) : -1;
  if (at < 0) return name;
  return (
    <>
      {name.slice(0, at)}
      <span className="text-[color:var(--vmb-accent)]">{accentPart}</span>
      {name.slice(at + accentPart.length)}
    </>
  );
}

export function VmbWordmark({ byline }: { byline?: string }) {
  return (
    <span className="flex items-center gap-2.5" dir="ltr">
      <VmbMark />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-tight">{wordParts()}</span>
        {byline ? (
          <span className="mt-1 text-[10px] font-medium text-[color:var(--vmb-muted)]" dir="rtl">
            {byline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
