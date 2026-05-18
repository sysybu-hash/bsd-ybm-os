"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { visibleTextFromUIMessage } from "@/lib/ai/ui-message-text";
import { useMemo, useState, type FormEvent } from "react";

type ToolLikePart = {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: string;
};

function toolPartsFromMessage(m: UIMessage): ToolLikePart[] {
  if (!m.parts?.length) return [];
  const out: ToolLikePart[] = [];
  for (const p of m.parts) {
    if (p.type === "dynamic-tool") {
      out.push(p as ToolLikePart);
      continue;
    }
    if (typeof p.type === "string" && p.type.startsWith("tool-")) {
      const name = p.type.replace(/^tool-/, "");
      out.push({ ...(p as ToolLikePart), toolName: name });
    }
  }
  return out;
}

function toolDisplayName(part: ToolLikePart): string {
  if (part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.replace(/^tool-/, "");
  return "מערכת";
}

export default function AiChat() {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        credentials: "same-origin",
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
  });

  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    void sendMessage({ text });
  };

  return (
    <div
      className="mx-auto flex h-[600px] w-full max-w-2xl flex-col rounded-lg border bg-white p-4 shadow-sm"
      dir="rtl"
    >
      <div className="mb-4 flex-1 space-y-4 overflow-y-auto">
        {messages.map((m) => {
          const content = visibleTextFromUIMessage(m);
          return (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-lg p-3 ${
                m.role === "user"
                  ? "mr-auto bg-blue-100 text-blue-900"
                  : "ml-auto bg-gray-100 text-gray-800"
              }`}
            >
              <span className="mb-1 block font-bold">
                {m.role === "user" ? "אתה: " : "עוזר חכם: "}
              </span>

              {content ? <div>{content}</div> : null}

              {toolPartsFromMessage(m).map((part) => {
                const toolName = toolDisplayName(part);
                const done = part.state === "output-available";

                if (done) {
                  return (
                    <div
                      key={part.toolCallId}
                      className="mt-2 rounded bg-green-50 p-2 text-sm text-green-600"
                    >
                      ✓ פעולה בוצעה בהצלחה ({toolName})
                    </div>
                  );
                }

                return (
                  <div
                    key={part.toolCallId}
                    className="mt-2 animate-pulse rounded bg-gray-50 p-2 text-sm text-gray-500"
                  >
                    ...מבצע פעולת מערכת ({toolName})...
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded-md border p-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={input}
          placeholder="בקש ממני לפתוח פרויקט או להוציא חשבונית..."
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isLoading ? "שולח..." : "שלח"}
        </button>
      </form>
    </div>
  );
}
