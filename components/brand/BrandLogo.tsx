import Image from "next/image";
import { BRAND_LOGO_ALT, BRAND_LOGO_SRC } from "@/lib/brand";

const SIZE_PX = {
  xs: 28,
  sm: 36,
  md: 40,
  lg: 56,
  xl: 80,
  hero: 120,
} as const;

export type BrandLogoSize = keyof typeof SIZE_PX;

type BrandLogoProps = {
  size?: BrandLogoSize;
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({ size = "md", className = "", priority }: BrandLogoProps) {
  const px = SIZE_PX[size];
  return (
    <Image
      src={BRAND_LOGO_SRC}
      alt={BRAND_LOGO_ALT}
      width={px}
      height={px}
      priority={priority}
      className={`shrink-0 rounded-xl object-cover shadow-md ring-1 ring-black/10 dark:ring-white/10 ${className}`.trim()}
    />
  );
}
