"use client";

import React, { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlignLeft,
  Bot,
  BrainCircuit,
  FileText,
  Loader2,
  Mic,
  Send,
  Upload,
  X,
} from "lucide-react";

type Source = {
  id: string;
  name: string;
  content: string;
  type: "pdf" | "text";
};

function textFromMessage(m: UIMessage): string {
  if (!m.parts?.length) return "";
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export default function NotebookLMWidget() {
  const [sources, setSources] = useState<Source[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourcesRef = useRef<Source[]>([]);
  sourcesRef.current = sources;

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

  const { messages, sendMessage, status } = useChat({
    id: "notebooklm-bsd-ybm-widget",
    transport,
  });

  const isLoading = status === "submitted" || status === "streaming";

  const [input, setInput] = useState("");
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

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
      const res = await fetch("/api/notebooklm/extract-pdf", {
        method: "POST",
        body: formData,
      });
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
        alert("שגיאה בחילוץ הטקסט: " + (data.error || "שגיאה לא ידועה"));
      }
    } catch (error) {
      console.error("Upload failed", error);
      alert("שגיאה בהעלאת הקובץ.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeSource = (id: string) => {
    setSources(sources.filter((s) => s.id !== id));
  };

  const handleQuickAction = (prompt: string) => {
    if (sources.length === 0) {
      alert("אנא הוסף מקורות ידע קודם.");
      return;
    }
    void sendMessage({ text: prompt });
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 font-sans backdrop-blur-xl md:flex-row"
      dir="rtl"
    >
      <div className="flex w-full flex-col border-white/10 bg-black/20 p-6 md:w-1/3 md:border-l">
        <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-100">
          <FileText className="h-5 w-5 text-blue-400" /> מקורות ידע
        </h2>

        <div
          className="group relative mb-6 cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-slate-600 p-6 text-center transition-all hover:border-blue-500 hover:bg-white/5"
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-blue-400" />
          ) : (
            <Upload className="mx-auto mb-2 h-8 w-8 text-slate-400 transition-colors group-hover:text-blue-400" />
          )}
          <p className="text-sm font-medium text-slate-300">גרור מסמך PDF או לחץ להעלאה</p>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
        </div>

        <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
          <AnimatePresence>
            {sources.map((source) => (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="rounded-md bg-blue-500/20 p-2 text-blue-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <span className="truncate text-sm font-medium text-slate-200">{source.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeSource(source.id)}
                  className="text-slate-500 transition-colors hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
            {sources.length === 0 && !isUploading && (
              <div className="mt-10 text-center text-sm text-slate-500">טרם הועלו מקורות מידע לסטודיו.</div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="relative flex h-full w-full flex-col md:w-2/3">
        <div className="flex items-center gap-3 border-b border-white/5 bg-white/[0.02] px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 shadow-lg shadow-blue-500/20">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100">סטודיו מחקר AI</h3>
            <p className="text-xs text-slate-400">{`מופעל ע"י Gemini 1.5 Flash`}</p>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500">
              <Bot className="mb-4 h-16 w-16 opacity-20" />
              <p>שאל אותי שאלות על המסמכים שהעלית.</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-blue-600 text-white shadow-md"
                      : "rounded-bl-sm border border-white/5 bg-white/10 text-slate-200"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{textFromMessage(m)}</div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-end">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-white/5 bg-white/5 p-4">
                <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-emerald-400"
                  style={{ animationDelay: "0.2s" }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-emerald-400"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/5 bg-black/20 p-4">
          <div className="custom-scrollbar mb-4 flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() =>
                handleQuickAction("צור סקירה קולית דמיונית בין שני מנחי פודקאסט על המסמכים.")
              }
              className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-xs font-medium text-purple-300 transition-all hover:bg-purple-500/20"
            >
              <Mic className="h-3 w-3" /> סקירה קולית
            </button>
            <button
              type="button"
              onClick={() => handleQuickAction("סכם את המקורות לתקציר מנהלים בנקודות קצרות וברורות.")}
              className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-300 transition-all hover:bg-blue-500/20"
            >
              <AlignLeft className="h-3 w-3" /> תקציר מנהלים
            </button>
            <button
              type="button"
              onClick={() => handleQuickAction("צור מפת חשיבה (רשימה היררכית) של הרעיונות המרכזיים.")}
              className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300 transition-all hover:bg-emerald-500/20"
            >
              <BrainCircuit className="h-3 w-3" /> מפת חשיבה
            </button>
          </div>

          <form onSubmit={handleSubmit} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="הקלד שאלה או פקודה..."
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3 px-4 pr-12 text-slate-100 placeholder:text-slate-500 transition-colors focus:border-blue-500 focus:outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input}
              className="absolute right-2 rounded-lg bg-blue-600 p-2 text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4 rtl:-scale-x-100" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
