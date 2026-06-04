"use client";

import dynamic from "next/dynamic";
import DeferUntilVisible from "@/components/layout/DeferUntilVisible";

const MarketingContactStrip = dynamic(
  () => import("@/components/landing/marketing/MarketingContactStrip"),
  { loading: () => <div className="min-h-[12rem] w-full" aria-hidden /> },
);

const MarketingFooter = dynamic(() => import("@/components/landing/marketing/MarketingFooter"), {
  loading: () => <div className="min-h-[16rem] w-full" aria-hidden />,
});

type Props = Readonly<{
  embedded?: boolean;
}>;

/** פוטר ויצירת קשר — נטענים רק בגלילה */
export default function MarketingDeferredChrome({ embedded }: Props) {
  return (
    <>
      <DeferUntilVisible
        rootMargin="-20% 0px 0px 0px"
        minHeight="12rem"
        fallback={<div className="min-h-[12rem] w-full" aria-hidden />}
      >
        <MarketingContactStrip embedded={embedded} />
      </DeferUntilVisible>
      <DeferUntilVisible
        rootMargin="-10% 0px 0px 0px"
        minHeight="16rem"
        fallback={<div className="min-h-[16rem] w-full" aria-hidden />}
      >
        <MarketingFooter />
      </DeferUntilVisible>
    </>
  );
}
