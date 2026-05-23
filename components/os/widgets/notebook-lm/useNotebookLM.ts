"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { visibleTextFromUIMessage } from "@/lib/ai/ui-message-text";
import { buildScanFileAcceptAttribute } from "@/lib/scan-mime";
import { toast } from "sonner";
import {
  useNotebookSpeechPlayback,
  useNotebookSpeechSettingsState,
} from "@/hooks/useNotebookSpeechPlayback";
import { ensureProjectNotebook } from "@/lib/notebooklm/ensure-project-notebook";
import type { Source, SavedNotebookSummary, ProjectOption } from "./types";
import { uiMessagesFromStored } from "./types";

const DRAFT_KEY = "notebooklm-draft-v1";

type UseNotebookLMParams = {
  liveData?: Record<string, unknown> | null;
  t: (key: string) => string;
};

export function useNotebookLM({ liveData, t }: UseNotebookLMParams) {
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
  const [issuePromptOpen, setIssuePromptOpen] = useState(false);
  const [isIssuingDocument, setIsIssuingDocument] = useState(false);
  const [issuedDocumentText, setIssuedDocumentText] = useState<string | null>(null);
  const [renameSourceId, setRenameSourceId] = useState<string | null>(null);
  const [deleteNotebookId, setDeleteNotebookId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileAccept = useMemo(() => buildScanFileAcceptAttribute(), []);
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
            sources: sourcesRef.current.map((s) => ({ name: s.name, content: s.content })),
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, setMessages } = useChat({ id: chatId, transport });
  const isLoading = status === "submitted" || status === "streaming";

  const { settings: speechSettings, setSettings: setSpeechSettings } = useNotebookSpeechSettingsState();
  const { play: playSpeech, pause: pauseSpeech, resume: resumeSpeech, stop: stopSpeech, isPlaying, isPaused, progress } =
    useNotebookSpeechPlayback(speechSettings);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  // Persist draft
  const persistDraft = useCallback(() => {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        notebookTitle,
        projectId,
        sources,
        messages: messages.map((m) => ({ role: m.role, content: visibleTextFromUIMessage(m) })),
      }),
    );
  }, [notebookTitle, projectId, sources, messages]);

  useEffect(() => {
    const timer = window.setTimeout(persistDraft, 500);
    return () => window.clearTimeout(timer);
  }, [persistDraft]);

  // Restore draft
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
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedNotebookId]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/org/scan-lookups", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { projects?: ProjectOption[] };
        setProjects(data.projects ?? []);
      }
    } catch { /* optional */ }
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
      toast.error(t("workspaceWidgets.notebookLM.loadListFailed"));
    }
  }, [projectId, t]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const handleLoadNotebook = useCallback(async (id: string) => {
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
      if (!res.ok || !data.notebook) { toast.error(t("workspaceWidgets.notebookLM.loadFailed")); return; }
      const nb = data.notebook;
      setSavedNotebookId(nb.id);
      setNotebookTitle(nb.title);
      setProjectId(nb.projectId ?? "");
      setSources(nb.sources.map((s) => ({ id: s.id, name: s.name, content: s.content, type: s.mimeType.includes("pdf") ? "pdf" : "text" })));
      setMessages(uiMessagesFromStored(nb.messages));
      setAudioScript(nb.audioOverview?.scriptText ?? null);
      setShowSavedPanel(false);
      toast.success("המחברת נטענה");
    } catch {
      toast.error(t("workspaceWidgets.notebookLM.loadFailed"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setMessages יציב
  }, [t]);

  const ensuredProjectRef = useRef<string | null>(null);

  useEffect(() => {
    const pid = liveData?.projectId;
    if (typeof pid === "string" && pid && ensuredProjectRef.current !== pid) {
      ensuredProjectRef.current = pid;
      setProjectId(pid);
      const title = typeof liveData?.title === "string" ? liveData.title : undefined;
      void (async () => {
        const { notebookId, created } = await ensureProjectNotebook(pid, title);
        if (!notebookId) return;
        setSavedNotebookId(notebookId);
        if (created) { setNotebookTitle(title?.trim() ? `מחברת — ${title.trim()}` : "מחברת פרויקט"); return; }
        void handleLoadNotebook(notebookId);
      })();
    }
    const notebookId = liveData?.notebookId;
    if (typeof notebookId === "string" && notebookId) void handleLoadNotebook(notebookId);
    if (typeof liveData?.title === "string" && liveData.title) setNotebookTitle(liveData.title);
    const preload = liveData?.preloadSources;
    if (Array.isArray(preload)) {
      setSources(
        preload.map((s, i) => {
          const row = s as { name?: string; content?: string; type?: string };
          return { id: `preload-${i}`, name: String(row.name ?? `מקור ${i + 1}`), content: String(row.content ?? ""), type: row.type === "pdf" ? "pdf" : "text" };
        }),
      );
    }
  }, [liveData, handleLoadNotebook]);

  const buildPayload = () => ({
    id: savedNotebookId ?? undefined,
    title: notebookTitle,
    projectId: projectId || null,
    sources: sources.map((s, i) => ({ name: s.name, content: s.content, mimeType: s.type === "pdf" ? "application/pdf" : "text/plain", sortOrder: i })),
    messages: messages.map((m) => ({ role: m.role, content: visibleTextFromUIMessage(m) })),
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/notebooklm/notebooks", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(buildPayload()),
      });
      const data = (await res.json()) as { notebook?: { id: string; audioOverview?: { scriptText: string } | null } };
      if (!res.ok) { toast.error(t("workspaceWidgets.notebookLM.saveFailed")); return; }
      if (data.notebook?.id) {
        setSavedNotebookId(data.notebook.id);
        if (data.notebook.audioOverview?.scriptText) setAudioScript(data.notebook.audioOverview.scriptText);
        toast.success("המחברת נשמרה");
        void refreshSavedList();
        sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch { toast.error(t("workspaceWidgets.notebookLM.saveFailed")); }
    finally { setIsSaving(false); }
  };

  const handleNewNotebook = () => {
    setSavedNotebookId(null); setNotebookTitle("מחברת חדשה"); setProjectId(""); setSources([]); setMessages([]); setAudioScript(null);
    sessionStorage.removeItem(DRAFT_KEY);
  };

  const uploadSourceFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/notebooklm/extract-source", { method: "POST", body: formData });
    const data = (await res.json()) as { text?: string; error?: string; mimeType?: string };
    if (!res.ok || !data.text) throw new Error(data.error || t("workspaceWidgets.notebookLM.extractFailed"));
    const isPdf = data.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    setSources((prev) => [...prev, { id: Math.random().toString(36).substring(7), name: file.name, content: data.text as string, type: isPdf ? "pdf" : "text" }]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setIsUploading(true);
    let ok = 0;
    try {
      for (const file of Array.from(files)) {
        try { await uploadSourceFile(file); ok += 1; }
        catch (err) { toast.error(`${file.name}: ${err instanceof Error ? err.message : t("workspaceWidgets.notebookLM.uploadFailed")}`); }
      }
      if (ok > 0) toast.success(`${ok} ${t("workspaceWidgets.notebookLM.uploadSuccess").replace("{count}", String(ok))}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleVoiceOverview = async () => {
    if (sources.length === 0) { toast.error(t("workspaceWidgets.notebookLM.audioSourcesFirst")); return; }
    setIsGeneratingAudio(true);
    try {
      let id = savedNotebookId;
      if (!id) {
        const saveRes = await fetch("/api/notebooklm/notebooks", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(buildPayload()) });
        const saveData = (await saveRes.json()) as { notebook?: { id: string } };
        if (!saveRes.ok || !saveData.notebook?.id) { toast.error(t("workspaceWidgets.notebookLM.saveBeforeAudio")); return; }
        id = saveData.notebook.id;
        setSavedNotebookId(id);
      }
      const res = await fetch(`/api/notebooklm/notebooks/${id}/audio-overview`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({}) });
      const data = (await res.json()) as { scriptText?: string };
      if (!res.ok || !data.scriptText) { toast.error(t("workspaceWidgets.notebookLM.audioFailed")); return; }
      setAudioScript(data.scriptText);
      playSpeech(data.scriptText);
    } catch { toast.error(t("workspaceWidgets.notebookLM.audioFailed")); }
    finally { setIsGeneratingAudio(false); }
  };

  const handleIssueDocument = async (requirement: string) => {
    const req = requirement.trim();
    if (!req) return;
    setIssuePromptOpen(false);
    setIsIssuingDocument(true);
    try {
      const res = await fetch("/api/notebooklm/generate-document", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ requirement: req, notebookTitle, sources: sources.map((s) => ({ name: s.name, content: s.content })) }),
      });
      const data = (await res.json()) as { text?: string; suggestedFileName?: string; error?: string };
      if (!res.ok || !data.text) { toast.error(data.error || t("workspaceWidgets.notebookLM.issueFailed")); return; }
      setIssuedDocumentText(data.text);
      setSources((prev) => [...prev, { id: `issued-${Date.now()}`, name: data.suggestedFileName ?? t("workspaceWidgets.notebookLM.issuedDocName"), content: data.text as string, type: "text" }]);
      toast.success(t("workspaceWidgets.notebookLM.issueSuccess"));
    } catch { toast.error(t("workspaceWidgets.notebookLM.issueFailed")); }
    finally { setIsIssuingDocument(false); }
  };

  const downloadIssuedDocument = () => {
    if (!issuedDocumentText) return;
    const blob = new Blob([issuedDocumentText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${notebookTitle.replace(/\s+/g, "-").slice(0, 40) || "מסמך-ממחברת"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeSource = (id: string) => setSources((prev) => prev.filter((s) => s.id !== id));
  const renameSource = (id: string) => { if (sources.find((s) => s.id === id)) setRenameSourceId(id); };
  const confirmRenameSource = (name: string) => {
    if (!renameSourceId || !name.trim()) { setRenameSourceId(null); return; }
    setSources((prev) => prev.map((s) => (s.id === renameSourceId ? { ...s, name: name.trim() } : s)));
    setRenameSourceId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    await sendMessage({ text });
  };

  const handleQuickAction = (prompt: string) => {
    if (sources.length === 0) { toast.error(t("workspaceWidgets.notebookLM.addSourcesFirst")); return; }
    void sendMessage({ text: prompt });
  };

  const handleDeleteSaved = (id: string) => setDeleteNotebookId(id);
  const confirmDeleteSaved = async () => {
    const id = deleteNotebookId;
    if (!id) return;
    setDeleteNotebookId(null);
    try {
      const res = await fetch(`/api/notebooklm/notebooks/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        if (savedNotebookId === id) handleNewNotebook();
        void refreshSavedList();
        toast.success("נמחק");
      }
    } catch { toast.error(t("workspaceWidgets.notebookLM.deleteFailed")); }
  };

  const renameSourceDefault = renameSourceId != null ? sources.find((s) => s.id === renameSourceId)?.name ?? "" : "";

  return {
    // state
    sources, setSources, isUploading, notebookTitle, setNotebookTitle, projectId, setProjectId,
    savedNotebookId, savedList, showSavedPanel, setShowSavedPanel, isSaving, projects,
    audioScript, isGeneratingAudio, issuePromptOpen, setIssuePromptOpen, isIssuingDocument,
    issuedDocumentText, renameSourceId, setRenameSourceId, deleteNotebookId, setDeleteNotebookId, input, setInput,
    fileInputRef, fileAccept, messages, isLoading,
    // speech
    speechSettings, setSpeechSettings, playSpeech, pauseSpeech, resumeSpeech, stopSpeech,
    isPlaying, isPaused, progress,
    // handlers
    handleSave, handleNewNotebook, handleLoadNotebook, handleFileUpload, handleVoiceOverview,
    handleIssueDocument, downloadIssuedDocument, removeSource, renameSource, confirmRenameSource,
    handleSubmit, handleQuickAction, handleDeleteSaved, confirmDeleteSaved,
    refreshSavedList, renameSourceDefault,
  };
}
