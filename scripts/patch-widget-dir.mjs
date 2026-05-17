import fs from "fs";
import path from "path";

const files = [
  "components/os/widgets/MeckanoReportsWidget.tsx",
  "components/os/widgets/ProjectBoardWidget.tsx",
  "components/os/CrmWidget.tsx",
  "components/os/DashboardWidget.tsx",
  "components/os/widgets/SettingsWidget.tsx",
  "components/os/widgets/AiChatFullWidget.tsx",
  "components/os/widgets/GoogleDriveWidget.tsx",
  "components/os/ProjectWidget.tsx",
  "components/os/widgets/CashflowWidget.tsx",
  "components/os/GeminiLiveSettingsSheet.tsx",
  "components/os/widgets/ErpDocumentsWidget.tsx",
  "components/os/widgets/ErpFileArchiveWidget.tsx",
  "components/os/widgets/NotebookLMWidget.tsx",
  "components/os/widgets/DocumentCreatorWidget.tsx",
  "components/os/widgets/GoogleAssistantWidget.tsx",
  "components/os/widgets/CrmTableWidget.tsx",
  "components/os/OmnibarQuickSettingsSheet.tsx",
  "app/login/page.tsx",
];

const importLine = `import { useI18n } from "@/components/os/system/I18nProvider";`;

for (const f of files) {
  const p = path.join(process.cwd(), f);
  if (!fs.existsSync(p)) {
    console.log("skip", f);
    continue;
  }
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes('dir="rtl"')) {
    console.log("no rtl", f);
    continue;
  }
  if (!s.includes("useI18n")) {
    const idx = s.indexOf("\n\n");
    if (idx >= 0) s = `${s.slice(0, idx + 2)}${importLine}\n${s.slice(idx + 2)}`;
    else s = `${importLine}\n${s}`;
  }
  s = s.replace(/dir="rtl"/g, "dir={dir}");
  if (!/const \{[^}]*\bdir\b[^}]*\} = useI18n\(\)/.test(s)) {
    s = s.replace(/export default function \w+\([^)]*\) \{\n/, (m) => `${m}  const { dir } = useI18n();\n`);
  }
  fs.writeFileSync(p, s);
  console.log("patched", f);
}
