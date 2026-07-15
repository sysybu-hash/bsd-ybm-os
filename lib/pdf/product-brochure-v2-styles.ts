import { fontFaceCss } from "@/lib/pdf/product-brochure-v2-assets";
import { BROCHURE_BASE_CSS } from "@/lib/pdf/brochure-styles/base";
import { BROCHURE_CREATOR_CSS } from "@/lib/pdf/brochure-styles/creator";
import { BROCHURE_LAYOUT_CSS } from "@/lib/pdf/brochure-styles/layout";
import { BROCHURE_PRINT_CSS } from "@/lib/pdf/brochure-styles/print";
import { BROCHURE_SECTIONS_CSS } from "@/lib/pdf/brochure-styles/sections";

export function productBrochureV2StylesCss(): string {
  return (
    fontFaceCss() +
    BROCHURE_BASE_CSS +
    BROCHURE_SECTIONS_CSS +
    BROCHURE_LAYOUT_CSS +
    BROCHURE_CREATOR_CSS +
    BROCHURE_PRINT_CSS
  );
}
