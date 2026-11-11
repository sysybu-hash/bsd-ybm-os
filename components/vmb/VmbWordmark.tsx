import Image from "next/image";
import { VMB_BRAND } from "@/lib/vmb/brand";

const { logo } = VMB_BRAND;

/** The cube alone, for tight spaces (studio top bar). */
export function VmbMark({ className = "h-8 w-auto" }: { className?: string }) {
  return <Image src={logo.mark} alt={VMB_BRAND.name} width={logo.markWidth} height={logo.markHeight} className={className} priority />;
}

/**
 * The full lockup. Both theme versions are in the page; CSS in tokens.css
 * shows the one matching the nearest [data-theme], so there is no flash.
 */
export function VmbWordmark({ byline, className = "h-10 w-auto" }: { byline?: string; className?: string }) {
  return (
    <span className="flex flex-col items-start gap-1" dir="ltr">
      <Image src={logo.dark} alt={VMB_BRAND.name} width={logo.width} height={logo.height} className={`vmb-logo-dark ${className}`} priority />
      <Image src={logo.light} alt="" aria-hidden width={logo.width} height={logo.height} className={`vmb-logo-light ${className}`} priority />
      {byline ? (
        <span className="ps-1 text-[10px] font-medium text-[color:var(--vmb-muted)]" dir="rtl">
          {byline}
        </span>
      ) : null}
    </span>
  );
}
