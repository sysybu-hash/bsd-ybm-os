"use client";

import Link from "next/link";
import { useI18n } from "@/components/os/system/I18nProvider";

export default function PreviewBanner() {
  const { t } = useI18n();

  return (
    <div
      className="mkt-preview-banner relative z-[60] px-4 py-2 text-center text-sm font-semibold"
      role="status"
    >
      <span>{t("marketingHome.cinematic.previewBanner")}</span>
      <span className="mx-2 opacity-50">·</span>
      <Link href="/" className="underline underline-offset-4">
        {t("marketingHome.cinematic.backToHome")}
      </Link>
    </div>
  );
}
