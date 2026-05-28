"use client";

import React, { useCallback, useRef, useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { osFieldClassName } from "@/components/os/ui/os-field";
import { useI18n } from "@/components/os/system/I18nProvider";

type Message = { role: "user" | "assistant"; content: string };

type PendingAction = {
  actionId: string;
  token: string;
  type: string;
  summary: string;
};

type TabId =
  | "subscriptions"
  | "pending"
  | "users"
  | "broadcast"
  | "health"
  | "settings"
  | "assistant";

type Props = {
  onNavigateTab?: (tabId: TabId) => void;
};

const QUICK_PROMPTS = [
  "מה מצב בריאות המערכת?",
  "אילו משתני ENV חסרים?",
  "כמה הרשמות ממתינות יש?",
  "סכם את המנויים לפי tier",
];

export default function AdminAssistantTab({ onNavigateTab }: Props) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "שלום. אני עוזר הניהול — אוכל לבדוק בריאות מערכת, סטטוס ENV, מנויים והרשמות. במה לעזור?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const nextMessages: Message[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/admin/assistant", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? t("platformAdmin.assistantError"));
          return;
        }

        setMessages((prev) => [...prev, { role: "assistant", content: String(data.text ?? "") }]);

        if (Array.isArray(data.pendingActions) && data.pendingActions.length > 0) {
          setPendingActions(
            data.pendingActions.map((p: PendingAction) => ({
              actionId: String(p.actionId),
              token: String(p.token),
              type: String(p.type),
              summary: String(p.summary),
            })),
          );
        }

        if (data.navigation?.tabId && onNavigateTab) {
          onNavigateTab(data.navigation.tabId as TabId);
          toast.message(data.navigation.hint ?? "מעבר לטאב המבוקש");
        }
      } catch {
        toast.error(t("platformAdmin.assistantContactError"));
      } finally {
        setLoading(false);
        setTimeout(scrollToEnd, 50);
      }
    },
    [loading, messages, onNavigateTab, scrollToEnd, t],
  );

  const executePending = useCallback(
    async (action: PendingAction) => {
      setExecutingId(action.actionId);
      try {
        const res = await fetch("/api/admin/assistant/execute", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionId: action.actionId, token: action.token }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? t("platformAdmin.actionFailed"));
          return;
        }
        toast.success(t("platformAdmin.actionSuccess"));
        setPendingActions((prev) => prev.filter((p) => p.actionId !== action.actionId));
      } catch {
        toast.error(t("platformAdmin.actionError"));
      } finally {
        setExecutingId(null);
      }
    },
    [t],
  );

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={loading}
            onClick={() => void send(q)}
            className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-1.5 text-xs text-[color:var(--foreground-muted)] hover:border-amber-500/40 hover:text-[color:var(--foreground-main)]"
          >
            {q}
          </button>
        ))}
      </div>

      {pendingActions.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-200">פעולות הממתינות לאישור</p>
          {pendingActions.map((action) => (
            <div
              key={action.actionId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-xs"
            >
              <span>{action.summary}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={executingId === action.actionId}
                  onClick={() => void executePending(action)}
                  className="rounded bg-emerald-600 px-2 py-1 text-white disabled:opacity-50"
                >
                  {executingId === action.actionId ? "מבצע…" : "אשר"}
                </button>
                <button
                  type="button"
                  disabled={executingId === action.actionId}
                  onClick={() =>
                    setPendingActions((prev) => prev.filter((p) => p.actionId !== action.actionId))
                  }
                  className="rounded border border-[color:var(--border-main)] px-2 py-1"
                >
                  בטל
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]">
        <div className="flex items-center gap-2 border-b border-[color:var(--border-main)] px-4 py-2">
          <Bot size={18} className="text-indigo-400" aria-hidden />
          <span className="text-sm font-semibold text-[color:var(--foreground-main)]">עוזר ניהול</span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "ms-auto bg-indigo-500/15 text-[color:var(--foreground-main)]"
                  : "me-auto bg-[color:var(--surface-elevated)] text-[color:var(--foreground-muted)]"
              }`}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              חושב…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex gap-2 border-t border-[color:var(--border-main)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            className={osFieldClassName}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="שאל על בריאות, ENV, מנויים…"
            disabled={loading}
            aria-label="הודעה לעוזר ניהול"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-50"
            aria-label="שליחה"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
