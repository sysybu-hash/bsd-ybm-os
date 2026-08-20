"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { ContextCommentRow } from "@/lib/validation/schemas/context-comment";

type Props = {
  targetId: string;
  targetType: "TASK" | "DOC";
};

export default function CommentsThread({ targetId, targetType }: Props) {
  const { t } = useI18n();
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<ContextCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ targetType, targetId });
      const res = await fetch(`/api/comments?${qs.toString()}`, { credentials: "include" });
      const data = (await res.json()) as { comments?: ContextCommentRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? t("workspaceWidgets.comments.loadError"));
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.comments.loadError"));
    } finally {
      setLoading(false);
    }
  }, [targetId, targetType, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const postComment = async () => {
    const text = comment.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, targetType, text }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t("workspaceWidgets.comments.postError"));
      setComment("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.comments.postError"));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="mt-4 border-t border-[color:var(--border-main)] pt-4">
      <h4 className="mb-2 text-sm font-bold text-[color:var(--foreground-main)]">
        {t("workspaceWidgets.comments.title")}
      </h4>

      {loading ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">{t("workspaceWidgets.comments.loading")}</p>
      ) : (
        <ul className="mb-3 max-h-40 space-y-2 overflow-y-auto custom-scrollbar">
          {comments.length === 0 ? (
            <li className="text-xs text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.comments.empty")}
            </li>
          ) : (
            comments.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm"
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-[color:var(--foreground-muted)]">
                  <span>{row.authorName ?? t("workspaceWidgets.comments.anonymous")}</span>
                  <time dateTime={row.createdAt}>
                    {new Date(row.createdAt).toLocaleString("he-IL")}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-[color:var(--foreground-main)]">{row.text}</p>
              </li>
            ))
          )}
        </ul>
      )}

      {error ? <p className="mb-2 text-xs text-rose-600">{error}</p> : null}

      <div className="flex gap-2">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void postComment();
            }
          }}
          className="flex-1 rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-2 text-sm text-[color:var(--foreground-main)]"
          placeholder={t("workspaceWidgets.comments.placeholder")}
          disabled={posting}
        />
        <button
          type="button"
          onClick={() => void postComment()}
          disabled={posting || !comment.trim()}
          className="rounded-md bg-[color:var(--brand-accent)] p-2 text-white disabled:opacity-50"
          aria-label={t("workspaceWidgets.comments.send")}
        >
          {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
