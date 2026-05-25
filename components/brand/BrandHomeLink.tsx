import Link from "next/link";
import BrandLogo, { type BrandLogoSize } from "@/components/brand/BrandLogo";
import { BRAND_LOGO_ALT } from "@/lib/brand";

type BrandHomeLinkProps = {
  size?: BrandLogoSize;
  className?: string;
  priority?: boolean;
  subtitle?: string;
};

/** קישור לדף הבית עם לוגו + BSD-YBM */
export default function BrandHomeLink({
  size = "md",
  className = "",
  priority,
  subtitle,
}: BrandHomeLinkProps) {
  return (
    <Link
      href="/"
      className={`inline-flex min-w-0 items-center rounded-lg outline-offset-2 transition-opacity hover:opacity-90 ${className}`.trim()}
      aria-label={BRAND_LOGO_ALT}
    >
      <BrandLogo size={size} priority={priority} subtitle={subtitle} />
    </Link>
  );
}
