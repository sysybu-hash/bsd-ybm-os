"use client";

import "./besiyata-strip.css";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  variant?: "marketing" | "landing";
}>;

export default function BesiyataStrip({ variant = "marketing" }: Props) {
  const { t } = useI18n();

  return (
    <div
      className={
        variant === "marketing"
          ? "mkt-besiyata fixed inset-x-0 top-0 z-[70] w-full"
          : "besiyata-strip relative z-30 w-full"
      }
      role="doc-subtitle"
    >
      <p className="besiyata-strip__text">{t("marketingHome.cinematic.besiyata")}</p>
      <span className="besiyata-strip__ornament" aria-hidden>
        ◆ ◆ ◆
      </span>
    </div>
  );
}
