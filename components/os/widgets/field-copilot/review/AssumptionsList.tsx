"use client";

import { useI18n } from "@/components/os/system/I18nProvider";

type Props = {
  items: string[];
  onChange: (items: string[]) => void;
};

export default function AssumptionsList({ items, onChange }: Props) {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border border-[color:var(--border-main)] p-4">
      <h4 className="mb-2 font-bold">{t("workspaceWidgets.fieldCopilot.assumptionsTitle")}</h4>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx}>
            <input
              className="w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-sm"
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[idx] = e.target.value;
                onChange(next);
              }}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="mt-2 text-xs font-bold text-sky-600"
      >
        + {t("workspaceWidgets.fieldCopilot.addAssumption")}
      </button>
    </div>
  );
}
