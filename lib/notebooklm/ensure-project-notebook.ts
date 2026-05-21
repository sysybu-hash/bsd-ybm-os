/** יוצר מחברת ברירת מחדל לפרויקט אם אין — לשימוש ב-NotebookLMWidget */
export async function ensureProjectNotebook(
  projectId: string,
  projectTitle?: string,
): Promise<{ notebookId: string | null; created: boolean }> {
  const q = `?projectId=${encodeURIComponent(projectId)}`;
  const listRes = await fetch(`/api/notebooklm/notebooks${q}`, { credentials: "include" });
  if (!listRes.ok) return { notebookId: null, created: false };

  const listData = (await listRes.json()) as { notebooks?: Array<{ id: string }> };
  const existing = listData.notebooks?.[0];
  if (existing?.id) return { notebookId: existing.id, created: false };

  const title = projectTitle?.trim()
    ? `מחברת — ${projectTitle.trim()}`
    : `מחברת פרויקט`;

  const createRes = await fetch("/api/notebooklm/notebooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ title, projectId, sources: [], messages: [] }),
  });
  if (!createRes.ok) return { notebookId: null, created: false };

  const created = (await createRes.json()) as { notebook?: { id: string } };
  return { notebookId: created.notebook?.id ?? null, created: true };
}
