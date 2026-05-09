"use client";

import { FormEvent, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: { mimeType: string; dataUrl: string }[];
};

type FloatingAgentChatProps = {
  onRequireLogin: () => void;
  onRequireCreateAccount: () => void;
};

export default function FloatingAgentChat({
  onRequireLogin,
  onRequireCreateAccount,
}: FloatingAgentChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I am your Level Up Install coordinator (Gemini). Ask about trim, built-ins, IKEA installs, TV mounting, scope, or booking. Say “show me” or “sketch” if you want a grounded concept image using retailer-realistic materials.",
    },
  ]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;

    setChatError(null);
    setAuthRequired(false);
    setChatLoading(true);
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    const historyForApi = messages.slice(-8);

    try {
      const response = await fetch("/api/portal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyForApi }),
      });
      const data = (await response.json()) as {
        reply?: string;
        error?: string;
        images?: { mimeType: string; data: string }[];
      };

      if (response.status === 401) {
        setAuthRequired(true);
        setChatError("Please log in or create an account to use the agent chat.");
        return;
      }

      if (!response.ok || (!data.reply && !(data.images && data.images.length > 0))) {
        throw new Error(data.error || "Chat agent is unavailable.");
      }

      const assistantImages = data.images?.map((img) => ({
        mimeType: img.mimeType,
        dataUrl: `data:${img.mimeType};base64,${img.data}`,
      }));

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: (data.reply ?? "").trim() || " ",
          ...(assistantImages?.length ? { images: assistantImages } : {}),
        },
      ]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Unable to send message.");
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div className="w-[92vw] max-w-sm rounded-2xl border border-[#dac6fb] bg-white shadow-[0_18px_48px_-20px_rgba(91,33,182,0.6)]">
          <div className="flex items-center justify-between rounded-t-2xl bg-[#f6efff] px-4 py-3">
            <p className="text-sm font-semibold text-[#2f1748]">Level Up Agent Chat</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-[#c8a6ef] px-2 py-1 text-xs font-semibold text-[#5b3292]"
            >
              Close
            </button>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto p-3">
            {messages.map((msg, index) => (
              <div
                key={`${msg.role}-${index}`}
                className={`rounded-xl px-3 py-2 text-sm ${
                  msg.role === "assistant"
                    ? "bg-[#f5efff] text-[#3c225d]"
                    : "ml-auto max-w-[90%] bg-[#6e3eb2] text-white"
                }`}
              >
                {(msg.content ?? "").trim() ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : null}
                {msg.images?.length ? (
                  <div className="mt-2 space-y-2">
                    {msg.images.map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${index}-img-${i}`}
                        src={img.dataUrl}
                        alt="Concept visualization"
                        className="max-h-48 max-w-full rounded-lg border border-[#e8d9ff] object-contain"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <form className="border-t border-[#ecdffd] p-3" onSubmit={handleSend}>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Type your question..."
                className="flex-1 rounded-xl border border-[#dcbef9] px-3 py-2 text-sm text-[#32174f]"
              />
              <button
                type="submit"
                disabled={chatLoading}
                className="rounded-full bg-[#6e3eb2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {chatLoading ? "..." : "Send"}
              </button>
            </div>

            {chatError ? <p className="mt-2 text-xs text-[#a2175d]">{chatError}</p> : null}

            {authRequired ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onRequireLogin}
                  className="rounded-full border border-[#6e3eb2] px-3 py-1 text-xs font-semibold text-[#5b3292]"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={onRequireCreateAccount}
                  className="rounded-full bg-[#6e3eb2] px-3 py-1 text-xs font-semibold text-white"
                >
                  Create Account
                </button>
              </div>
            ) : null}
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-full bg-[#6e3eb2] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-12px_rgba(91,33,182,0.9)] hover:bg-[#5b3292]"
        >
          Chat with Agent
        </button>
      )}
    </div>
  );
}

