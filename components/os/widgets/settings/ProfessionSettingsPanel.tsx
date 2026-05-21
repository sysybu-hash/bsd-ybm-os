"use client";

import React, { useState, useTransition } from "react";
import { BriefcaseBusiness, Loader2, Save } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { updateIndustryProfileAction } from "@/app/actions/org-settings";
import { BUSINESS_LINE_IDS, businessLineLabelHe } from "@/lib/business-lines";
import { CONSTRUCTION_TRADE_IDS, constructionTradeLabelHe } from "@/lib/construction-trades";
import { INDUSTRY_CONFIGS, type IndustryType } from "@/lib/professions/config";
import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldClassName } from "@/components/os/ui/os-field";

const SELECTABLE_INDUSTRIES: IndustryType[] = ["CONSTRUCTION", "COMPANY_MGMT"];

type Props = {
  initialIndustry?: string | null;
  initialSpecialization?: string | null;
};

export default function ProfessionSettingsPanel({
  initialIndustry = "CONSTRUCTION",
  initialSpecialization = "GENERAL_CONTRACTOR",
}: Props) {
  const { t } = useI18n();
  const { data: session, update: updateSession } = useSession();
  const [industry, setIndustry] = useState(
    SELECTABLE_INDUSTRIES.includes(initialIndustry as IndustryType)
      ? (initialIndustry as IndustryType)
      : "CONSTRUCTION",
  );
  const [specialization, setSpecialization] = useState(initialSpecialization ?? "GENERAL_CONTRACTOR");
  const [pending, startTransition] = useTransition();

  const isOrgAdmin =
    session?.user?.role === "ORG_ADMIN" || session?.user?.role === "SUPER_ADMIN";

  if (!isOrgAdmin) {
    return (
      <p className="text-xs text-[color:var(--foreground-muted)]">
        רק מנהל ארגון יכול לשנות את תחום העסק וההתמחות.
      </p>
    );
  }

  const specOptions =
    industry === "COMPANY_MGMT"
      ? BUSINESS_LINE_IDS.map((id) => ({ id, label: businessLineLabelHe(id) }))
      : CONSTRUCTION_TRADE_IDS.map((id) => ({ id, label: constructionTradeLabelHe(id) }));

  const onIndustryChange = (next: IndustryType) => {
    setIndustry(next);
    setSpecialization(next === "COMPANY_MGMT" ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");
  };

  const save = () => {
    const fd = new FormData();
    fd.set("industry", industry);
    fd.set("constructionTrade", specialization);
    startTransition(async () => {
      const res = await updateIndustryProfileAction(fd);
      if (!res.ok) {
        toast.error("error" in res ? res.error : "שמירה נכשלה");
        return;
      }
      toast.success("תחום העסק וההתמחות עודכנו — מומלץ לרענן את הדף");
      await updateSession?.();
    });
  };

  return (
    <section
      id="settings-profession"
      className="space-y-3 rounded-xl border border-[color:var(--border-main)] p-3"
      dir="rtl"
    >
      <header className="flex items-center gap-2 text-sm font-bold">
        <BriefcaseBusiness size={16} className="text-amber-400" />
        {industry === "COMPANY_MGMT" ? "תחום העסק / החברה" : "תחום בנייה וקבלנות"}
      </header>
      <p className="text-[11px] text-[color:var(--foreground-muted)]">
        בחירת הענף משנה את אוצר המילים, מצבי הסריקה, תתי-תחומים בפרויקטים ותפריט ההפעלה.
      </p>
      <label className="block text-[11px]">
        <span className="text-[color:var(--foreground-muted)]">ענף</span>
        <select
          className={`${osFieldClassName} mt-1 w-full`}
          value={industry}
          onChange={(e) => onIndustryChange(e.target.value as IndustryType)}
        >
          {SELECTABLE_INDUSTRIES.map((id) => (
            <option key={id} value={id}>
              {t(`professions.${id}.label`) || INDUSTRY_CONFIGS[id].label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[11px]">
        <span className="text-[color:var(--foreground-muted)]">התמחות</span>
        <select
          className={`${osFieldClassName} mt-1 w-full`}
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
        >
          {specOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        שמירת תחום והתמחות
      </button>
    </section>
  );
}
