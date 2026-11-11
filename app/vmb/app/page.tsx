import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVmbPageUser, vmbServerPath } from "@/lib/vmb/page-session";
import { AccountMenu } from "@/components/vmb/studio/AccountMenu";
import { vmbT } from "@/lib/vmb/i18n";
import { StudioShell } from "@/components/vmb/studio/StudioShell";
import { ProgressCard, ScanCard } from "@/components/vmb/studio/JobCards";
import { OverlayViewer } from "@/components/vmb/studio/OverlayViewer";

export const dynamic = "force-dynamic";

const t = vmbT("he");

export const metadata: Metadata = { title: t("vmb.studio.projects"), robots: { index: false } };

/**
 * Design-gate sample of the working app (static demo data). The live version
 * reads the job, scan report and model from /api/vmb once M1–M2 land.
 */
export default async function VmbStudioSamplePage() {
  const user = await getVmbPageUser();
  if (!user) redirect(await vmbServerPath("/login"));
  const s = (k: string) => t(`vmb.studio.${k}`);
  return (
    <StudioShell
      current={4}
      account={<AccountMenu name={user.name ?? user.email} image={user.image} logoutLabel={s("logout")} />}
      labels={{
        projects: s("projects"),
        account: s("account"),
        credits: s("credits"),
        creditsValue: s("creditsValue"),
        projectName: s("projectName"),
        projectMeta: s("projectMeta"),
        steps: ["stepUpload", "stepScan", "stepQuestions", "stepCost", "stepRun", "stepStudio", "stepBooklet"].map(s),
        themeLight: s("themeLight"),
        themeDark: s("themeDark"),
      }}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <OverlayViewer
          labels={{
            title: s("viewerTitle"),
            sheet: s("toggleSheet"),
            model: s("toggleModel"),
            overlay: s("toggleOverlay"),
            close: s("legendClose"),
            near: s("legendNear"),
            far: s("legendFar"),
          }}
        />
        <div className="space-y-4">
          <ProgressCard
            percent={56}
            labels={{ title: s("progressTitle"), stage: s("progressStage"), eta: s("progressEta"), leave: s("progressLeave") }}
          />
          <ScanCard
            labels={{
              title: s("scanTitle"),
              file: s("scanFile"),
              layers: s("scanLayers"),
              blocks: s("scanBlocks"),
              entities: s("scanEntities"),
              ink: s("scanInk"),
              missed: s("scanMissed"),
              missed1: s("scanMissed1"),
              missed2: s("scanMissed2"),
              rescan: s("rescan"),
              rescanHint: s("rescanHint"),
            }}
          />
          <section className="vmb-card p-5">
            <h2 className="text-sm font-bold">{s("logTitle")}</h2>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-[color:var(--vmb-ink-soft)]">
              {["log1", "log2", "log3", "log4"].map((k, i) => (
                <li key={k} className="flex gap-2">
                  <span className="text-[color:var(--vmb-muted)]">{`0${i + 1}`}</span>
                  <span style={{ unicodeBidi: "plaintext" }}>{s(k)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </StudioShell>
  );
}
