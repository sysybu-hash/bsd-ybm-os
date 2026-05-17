import Link from "next/link";
import BrandLogo, { type BrandLogoSize } from "@/components/brand/BrandLogo";

type BrandHomeLinkProps = {
  size?: BrandLogoSize;
  className?: string;
  priority?: boolean;
};

/** קישור לדף הבית עם הלוגו הרשמי */
export default function BrandHomeLink({ size = "md", className = "", priority }: BrandHomeLinkProps) {
  return (
    <Link href="/" className={`inline-flex items-center ${className}`.trim()} aria-label="BY — BSD-YBM">
      <BrandLogo size={size} priority={priority} />
    </Link>
  );
}
