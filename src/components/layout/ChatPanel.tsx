"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, Sparkles, User, Zap, ListTodo, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { notifyStoreUpdated } from "@/lib/store-events";
import { sendChatMessage } from "@/lib/api-client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  { label: "What's overdue?", icon: Zap },
  { label: "Prioritize my day", icon: ListTodo },
  { label: "Slack follow-ups?", icon: MessageSquare },
] as const;

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hey! I'm your Helpit copilot — ask what's overdue, add tasks, or triage Slack. I'll update your dashboard live.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const userMessage = text.trim();
    if (!userMessage || loading) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const data = await sendChatMessage(userMessage, messages);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? "Sorry, something went wrong." },
      ]);
      if (data.storeUpdated) {
        notifyStoreUpdated();
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Couldn't reach the assistant. Try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const showQuickPrompts = messages.length === 1 && !loading;

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card sm:w-[340px]",
        "h-[min(70dvh,calc(100dvh-6rem))] sm:h-[min(480px,calc(100dvh-10rem))]",
        "shadow-[0_12px_40px_-8px_rgba(15,23,42,0.18),0_8px_16px_-6px_rgba(15,23,42,0.1)]"
      )}
    >
      <div className="relative shrink-0 border-b border-border bg-gradient-to-r from-accent/10 via-accent-secondary/5 to-transparent px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent shadow-sm shadow-accent/25">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Assistant</h2>
              <p className="text-[11px] text-muted">Live dashboard context</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/60 hover:text-foreground"
            aria-label="Close assistant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "")}
          >
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                msg.role === "user" ? "bg-slate-100" : "bg-accent/15"
              )}
            >
              {msg.role === "user" ? (
                <User className="h-3 w-3 text-slate-600" />
              ) : (
                <Sparkles className="h-3 w-3 text-accent" />
              )}
            </div>
            <div
              className={cn(
                "max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap",
                msg.role === "user"
                  ? "rounded-br-md bg-brand text-white"
                  : "rounded-bl-md border border-border/60 bg-slate-50/80 text-foreground"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent/15">
              <Sparkles className="h-3 w-3 text-accent" />
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border/60 bg-slate-50/80 px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-slate-50/50 px-3 py-3">
        {showQuickPrompts && (
          <div className="mb-2.5 space-y-1.5">
            <p className="text-[10px] font-medium tracking-wide text-muted uppercase">
              Try asking
            </p>
            <div className="flex flex-col gap-1">
              {QUICK_PROMPTS.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => sendMessage(label)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5 text-left text-xs text-foreground transition-all hover:border-accent/40 hover:bg-accent/5 hover:shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
            placeholder="Ask anything..."
            className="flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition-shadow placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm shadow-accent/30 transition-all hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
