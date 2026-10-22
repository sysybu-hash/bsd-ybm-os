type TFn = (key: string, vars?: Record<string, string>) => string;

/** What a subscriber sees instead of paid painting. The measured render stays on their plan. */
export default function FloorplanVizPaintContact({ t, email }: { t: TFn; email: string }) {
  return (
    <section className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] p-4">
      <h3 className="text-sm font-bold">{t("workspaceWidgets.floorplanViz.paintContactTitle")}</h3>
      <p className="mt-1 text-xs leading-5 text-[color:var(--foreground-muted)]">
        {t("workspaceWidgets.floorplanViz.paintContactBody")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {email ? (
          <a className="text-sm font-semibold text-violet-600 underline" href={`mailto:${email}`}>
            {email}
          </a>
        ) : null}
        <a className="text-sm font-semibold text-violet-600 underline" href="/contact">
          {t("workspaceWidgets.floorplanViz.paintContactPage")}
        </a>
      </div>
    </section>
  );
}
