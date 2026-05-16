"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlignLeft,
  Bot,
  BrainCircuit,
  FileText,
  FolderOpen,
  Loader2,
  Mic,
  Pause,
  Play,
  Save,
  Send,
  Square,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import ItemActions from "@/components/os/ItemActions";
import {
  useNotebookSpeechPlayback,
  useNotebookSpeechSettingsState,
} from "@/hooks/useNotebookSpeechPlayback";
import NotebookSpeechSettingsPanel from "@/components/os/widgets/NotebookSpeechSettingsPanel";

const DRAFT_KEY = "notebooklm-draft-v1";

type Source = {
  id: string;
  name: string;
  content: string;
  type: "pdf" | "text";
};

type SavedNotebookSummary = {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: string;
  sourceCount: number;
  messageCount: number;
};

type ProjectOption = { id: string; name: string };

function textFromMessage(m: UIMessage): string {
  if (!m.parts?.length) return "";
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function uiMessagesFromStored(
  stored: Array<{ id?: string; role: string; content: string }>,
): UIMessage[] {
  return stored.map((m, i) => ({
    id: m.id ?? `msg-${i}`,
    role: m.role as UIMessage["role"],
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export default function NotebookLMWidget() {
  const { dir } = useI18n();
  const [sources, setSources] = useState<Source[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [notebookTitle, setNotebookTitle] = useState("מחברת חדשה");
  const [projectId, setProjectId] = useState<string>("");
  const [savedNotebookId, setSavedNotebookId] = useState<string | null>(null);
  const [savedList, setSavedList] = useState<SavedNotebookSummary[]>([]);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [audioScript, setAudioScript] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourcesRef = useRef<Source[]>([]);
  sourcesRef.current = sources;

  const chatId = savedNotebookId ? `notebooklm-${savedNotebookId}` : "notebooklm-bsd-ybm-widget";

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/notebooklm/chat",
        credentials: "same-origin",
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
          body: {
            ...body,
            id,
            messages,
            trigger,
            messageId,
            sources: sourcesRef.current.map((s) => ({
              name: s.name,
              content: s.content,
            })),
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    id: chatId,
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const { settings: speechSettings, setSettings: setSpeechSettings } = useNotebookSpeechSettingsState();
  const {
    play: playSpeech,
    pause: pauseSpeech,
    resume: resumeSpeech,
    stop: stopSpeech,
    isPlaying,
    isPaused,
    progress,
  } = useNotebookSpeechPlayback(speechSettings);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  const [input, setInput] = useState("");

  const persistDraft = useCallback(() => {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        notebookTitle,
        projectId,
        sources,
        messages: messages.map((m) => ({ role: m.role, content: textFromMessage(m) })),
      }),
    );
  }, [notebookTitle, projectId, sources, messages]);

  useEffect(() => {
    const t = window.setTimeout(persistDraft, 500);
    return () => window.clearTimeout(t);
  }, [persistDraft]);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw || savedNotebookId) return;
    try {
      const d = JSON.parse(raw) as {
        notebookTitle?: string;
        projectId?: string;
        sources?: Source[];
        messages?: Array<{ role: string; content: string }>;
      };
      if (d.notebookTitle) setNotebookTitle(d.notebookTitle);
      if (d.projectId) setProjectId(d.projectId);
      if (Array.isArray(d.sources) && d.sources.length) setSources(d.sources);
      if (Array.isArray(d.messages) && d.messages.length) setMessages(uiMessagesFromStored(d.messages));
    } catch {
      /* ignore */
    }
  }, [savedNotebookId, setMessages]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/org/scan-lookups", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { projects?: ProjectOption[] };
        setProjects(data.projects ?? []);
      }
    } catch {
      /* optional */
    }
  }, []);

  const refreshSavedList = useCallback(async () => {
    try {
      const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const res = await fetch(`/api/notebooklm/notebooks${q}`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { notebooks: SavedNotebookSummary[] };
        setSavedList(data.notebooks ?? []);
      }
    } catch {
      toast.error("לא ניתן לטעון רשימת מחברות");
    }
  }, [projectId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const t = input.trim();
    setInput("");
    await sendMessage({ text: t });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/notebooklm/extract-pdf", { method: "POST", body: formData });
      const data = (await res.json()) as { text?: string; error?: string };

      if (data.text) {
        setSources((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            name: file.name,
            content: data.text as string,
            type: "pdf",
          },
        ]);
      } else {
        toast.error(data.error || "שגיאה בחילוץ הטקסט");
      }
    } catch {
      toast.error("שגיאה בהעלאת הקובץ");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  const renameSource = (id: string) => {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    const name = window.prompt("שם מקור:", src.name);
    if (!name?.trim()) return;
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)));
  };

  const handleQuickAction = (prompt: string) => {
    if (sources.length === 0) {
      toast.error("הוסף מקורות ידע קודם");
      return;
    }
    void sendMessage({ text: prompt });
  };

  const buildPayload = () => ({
    id: savedNotebookId ?? undefined,
    title: notebookTitle,
    projectId: projectId || null,
    sources: sources.map((s, i) => ({
      name: s.name,
      content: s.content,
      mimeType: s.type === "pdf" ? "application/pdf" : "text/plain",
      sortOrder: i,
    })),
    messages: messages.map((m) => ({
      role: m.role,
      content: textFromMessage(m),
    })),
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/notebooklm/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload()),
      });
      const data = (await res.json()) as { notebook?: { id: string; audioOverview?: { scriptText: string } | null } };
      if (!res.ok) {
        toast.error("שמירה נכשלה");
        return;
      }
      if (data.notebook?.id) {
        setSavedNotebookId(data.notebook.id);
        if (data.notebook.audioOverview?.scriptText) {
          setAudioScript(data.notebook.audioOverview.scriptText);
        }
        toast.success("המחברת נשמרה");
        void refreshSavedList();
        sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      toast.error("שמירה נכשלה");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadNotebook = async (id: string) => {
    try {
      const res = await fetch(`/api/notebooklm/notebooks/${id}`, { credentials: "include" });
      const data = (await res.json()) as {
        notebook?: {
          id: string;
          title: string;
          projectId: string | null;
          sources: Array<{ id: string; name: string; content: string; mimeType: string }>;
          messages: Array<{ role: string; content: string }>;
          audioOverview: { scriptText: string } | null;
        };
      };
      if (!res.ok || !data.notebook) {
        toast.error("טעינה נכשלה");
        return;
      }
      const nb = data.notebook;
      setSavedNotebookId(nb.id);
      setNotebookTitle(nb.title);
      setProjectId(nb.projectId ?? "");
      setSources(
        nb.sources.map((s) => ({
          id: s.id,
          name: s.name,
          content: s.content,
          type: s.mimeType.includes("pdf") ? "pdf" : "text",
        })),
      );
      setMessages(uiMessagesFromStored(nb.messages));
      setAudioScript(nb.audioOverview?.scriptText ?? null);
      setShowSavedPanel(false);
      toast.success("המחברת נטענה");
    } catch {
      toast.error("טעינה נכשלה");
    }
  };

  const handleDeleteSaved = async (id: string) => {
    if (!window.confirm("למחוק מחברת זו?")) return;
    try {
      const res = await fetch(`/api/notebooklm/notebooks/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        if (savedNotebookId === id) handleNewNotebook();
        void refreshSavedList();
        toast.success("נמחק");
      }
    } catch {
      toast.error("מחיקה נכשלה");
    }
  };

  const handleNewNotebook = () => {
    setSavedNotebookId(null);
    setNotebookTitle("מחברת חדשה");
    setProjectId("");
    setSources([]);
    setMessages([]);
    setAudioScript(null);
    sessionStorage.removeItem(DRAFT_KEY);
  };

  const handleVoiceOverview = async () => {
    if (sources.length === 0) {
      toast.error("הוסף מקורות לפני סקירה קולית");
      return;
    }

    setIsGeneratingAudio(true);
    try {
      let id = savedNotebookId;
      if (!id) {
        const saveRes = await fetch("/api/notebooklm/notebooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(buildPayload()),
        });
        const saveData = (await saveRes.json()) as { notebook?: { id: string } };
        if (!saveRes.ok || !saveData.notebook?.id) {
          toast.error("שמור את המחברת לפני סקירה קולית");
          return;
        }
        id = saveData.notebook.id;
        setSavedNotebookId(id);
      }

      const res = await fetch(`/api/notebooklm/notebooks/${id}/audio-overview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { scriptText?: string };
      if (!res.ok || !data.scriptText) {
        toast.error("יצירת סקירה נכשלה");
        return;
      }
      setAudioScript(data.scriptText);
      playSpeech(data.scriptText);
    } catch {
      toast.error("יצירת סקירה נכשלה");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/90 font-sans backdrop-blur-xl md:flex-row"
      dir={dir}
    >
      <div className="flex w-full flex-col border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/50 p-4 md:w-1/3 md:border-l">
        <div className="mb-4 space-y-2">
          <input
            type="text"
            value={notebookTitle}
            onChange={(e) => setNotebookTitle(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm font-bold text-[color:var(--foreground-main)]"
            aria-label="כותרת מחברת"
          />
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-xs text-[color:var(--foreground-main)]"
            aria-label="שיוך לפרויקט"
          >
            <option value="">כללי (ללא פרויקט)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSave()}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              שמור
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSavedPanel((v) => !v);
                void refreshSavedList();
              }}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-medium text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-card)]"
            >
              <FolderOpen className="h-3 w-3" />
              טען
            </button>
            <button
              type="button"
              onClick={handleNewNotebook}
              className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-card)]"
            >
              חדש
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showSavedPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-2"
            >
              {savedList.length === 0 ? (
                <p className="p-2 text-center text-xs text-[color:var(--foreground-muted)]">אין מחברות שמורות</p>
              ) : (
                savedList.map((nb) => (
                  <motion.div
                    key={nb.id}
                    className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-[color:var(--surface-soft)]"
                  >
                    <button
                      type="button"
                      className="flex-1 truncate text-right text-xs font-medium text-[color:var(--foreground-main)]"
                      onClick={() => void handleLoadNotebook(nb.id)}
                    >
                      {nb.title}
                    </button>
                    <ItemActions onDelete={() => void handleDeleteSaved(nb.id)} deleteLabel="מחק מחברת" />
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[color:var(--foreground-main)]">
          <FileText className="h-5 w-5 text-indigo-500" /> מקורות ידע
        </h2>

        <div
          className="group relative mb-4 cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-[color:var(--border-main)] p-6 text-center transition hover:border-indigo-500/50 hover:bg-[color:var(--surface-soft)]"
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-indigo-500" />
          ) : (
            <Upload className="mx-auto mb-2 h-8 w-8 text-[color:var(--foreground-muted)] group-hover:text-indigo-500" />
          )}
          <p className="text-sm font-medium text-[color:var(--foreground-muted)]">גרור PDF או לחץ להעלאה</p>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
        </div>

        <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
          <AnimatePresence>
            {sources.map((source) => (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="rounded-md bg-indigo-500/15 p-2 text-indigo-500">
                    <FileText className="h-4 w-4" />
                  </div>
                  <span className="truncate text-sm font-medium text-[color:var(--foreground-main)]">{source.name}</span>
                </div>
                <ItemActions onEdit={() => renameSource(source.id)} onDelete={() => removeSource(source.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
          {sources.length === 0 && !isUploading && (
            <p className="mt-6 text-center text-sm text-[color:var(--foreground-muted)]">טרם הועלו מקורות.</p>
          )}
        </div>
      </div>

      <div className="relative flex h-full w-full flex-col md:w-2/3">
        <div className="flex items-center gap-3 border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/30 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-indigo-600 shadow-md">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-[color:var(--foreground-main)]">סטודיו מחקר AI</h3>
            <p className="text-xs text-[color:var(--foreground-muted)]">Gemini 2.5 Flash</p>
          </div>
        </div>

        {audioScript ? (
          <motion.div className="space-y-3 border-b border-[color:var(--border-main)] bg-indigo-500/5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300">סקירה קולית</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {!isPlaying && !isPaused ? (
                  <button
                    type="button"
                    onClick={() => playSpeech(audioScript)}
                    className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-500"
                  >
                    <Play className="h-3 w-3" aria-hidden />
                    השמע
                  </button>
                ) : null}
                {isPlaying ? (
                  <button
                    type="button"
                    onClick={pauseSpeech}
                    className="flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-200"
                  >
                    <Pause className="h-3 w-3" aria-hidden />
                    השהה
                  </button>
                ) : null}
                {isPaused ? (
                  <button
                    type="button"
                    onClick={resumeSpeech}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-500"
                  >
                    <Play className="h-3 w-3" aria-hidden />
                    המשך
                  </button>
                ) : null}
                {isPlaying || isPaused ? (
                  <button
                    type="button"
                    onClick={stopSpeech}
                    className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2.5 py-1 text-[10px] font-bold text-[color:var(--foreground-main)]"
                  >
                    <Square className="h-3 w-3" aria-hidden />
                    עצור
                  </button>
                ) : null}
              </div>
            </div>

            {(isPlaying || isPaused) && audioScript.length > 0 ? (
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-soft)]">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[10px] font-semibold text-[color:var(--foreground-muted)]">
                  {isPaused ? "מושהה" : "מנגן"} · {progress}%
                </p>
              </div>
            ) : null}

            <NotebookSpeechSettingsPanel
              settings={speechSettings}
              onChange={setSpeechSettings}
              onPreview={() => playSpeech("שלום, כך נשמעת הסקירה הקולית שלך במחברת BSD-YBM.")}
              previewSnippet="שלום, כך נשמעת הסקירה הקולית שלך במחברת BSD-YBM."
            />

            <p className="max-h-24 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--foreground-muted)]">
              {audioScript}
            </p>
          </motion.div>
        ) : null}

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-[color:var(--foreground-muted)]">
              <Bot className="mb-4 h-14 w-14 opacity-20" />
              <p>שאל שאלות על המסמכים שהעלית.</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-indigo-600 text-white"
                      : "rounded-bl-sm border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-main)]"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{textFromMessage(m)}</div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-end">
              <div className="flex gap-1 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500" style={{ animationDelay: "0.15s" }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/40 p-3">
          <div className="custom-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              disabled={isGeneratingAudio}
              onClick={() => void handleVoiceOverview()}
              className="flex shrink-0 items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-500/20 disabled:opacity-50 dark:text-indigo-300"
            >
              {isGeneratingAudio ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
              סקירה קולית
            </button>
            <button
              type="button"
              onClick={() => handleQuickAction("סכם את המקורות לתקציר מנהלים בנקודות קצרות.")}
              className="flex shrink-0 items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-500/20 dark:text-teal-300"
            >
              <AlignLeft className="h-3 w-3" /> תקציר
            </button>
            <button
              type="button"
              onClick={() => handleQuickAction("צור מפת חשיבה היררכית של הרעיונות המרכזיים.")}
              className="flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-soft)]"
            >
              <BrainCircuit className="h-3 w-3" /> מפת חשיבה
            </button>
          </div>

          <form onSubmit={handleSubmit} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="הקלד שאלה..."
              className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] py-2.5 pl-12 pr-4 text-sm text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] focus:border-indigo-500 focus:outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute left-2 rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Send className="h-4 w-4 rtl:-scale-x-100" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
