from pathlib import Path

p = Path("components/os/widgets/CrmTableWidget.tsx")
text = p.read_text(encoding="utf-8")
marker = "פרויקטים פעילים"
idx = text.find(marker)
if idx < 0:
    raise SystemExit("marker not found")
start = text.rfind("<section>", 0, idx)
end = text.find("</section>", start) + len("</section>")
replacement = """<section>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">פרויקט משויך</h4>
                      </div>
                      <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 p-4">
                        <label className="text-[9px] font-bold text-slate-500 uppercase block">בחר פרויקט</label>
                        <select
                          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm"
                          value={selectedClient.projectId ?? ""}
                          disabled={savingProject}
                          onChange={(e) => {
                            void saveClientProject(e.target.value || null);
                          }}
                        >
                          <option value="">ללא פרויקט</option>
                          {projectOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={creatingProject}
                            onClick={() => void handleCreateProjectForClient()}
                            className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {creatingProject ? "יוצר…" : "פרויקט חדש"}
                          </button>
                          {selectedClient.projectId && openWorkspaceWidget ? (
                            <button
                              type="button"
                              onClick={openProjectHub}
                              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                            >
                              פתח מרכז שליטה
                            </button>
                          ) : null}
                        </div>
                        {selectedClient.projectName ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            מקושר ל: <span className="font-bold">{selectedClient.projectName}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">אין פרויקט משויך</p>
                        )}
                      </div>
                    </section>"""
p.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
print("ok")
