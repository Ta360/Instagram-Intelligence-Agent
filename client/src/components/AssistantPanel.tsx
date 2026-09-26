import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bot, CheckCircle2, Loader2, Send, Sparkles, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { DemoBadge } from "@/components/common";
import { ANALYTICS_KEYS, useSystemStatus } from "@/hooks/queries";
import { useAppState } from "@/hooks/appState";
import { ApiError, api } from "@/lib/api";
import type { AssistantAction, AssistantReply } from "@/lib/types";
import { formatDayKey } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  reply?: AssistantReply;
  error?: boolean;
}

const SUGGESTIONS = [
  "Search @exampleuser",
  "Show @exampleuser analytics",
  "Show today's searches",
  "Show profiles searched today",
  "Show my most searched profiles this week",
  "Show profile activity for September 2026",
];

function actionLabel(a: AssistantAction) {
  switch (a.type) {
    case "openProfile":
      return `Open @${a.username}`;
    case "openDate":
      return `Open ${formatDayKey(a.date, "long")}`;
    case "openMonth":
      return `Open calendar ${a.month}`;
    case "openHistory":
      return "Open search history";
    case "openSaved":
      return "Open saved profiles";
  }
}

/**
 * AI Assistant. Every answer is produced by the backend calling real tools
 * (searchInstagramProfile, getProfileHistory, getDateAnalytics, …); the tool
 * trace is shown under each reply so users can see where numbers came from.
 */
export function AssistantPanel({ onNavigate }: { onNavigate?: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectProfile } = useAppState();
  const { data: status } = useSystemStatus();

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: message }]);
    setBusy(true);
    try {
      const reply = await api.assistant(message, history);
      setMessages((m) => [...m, { role: "assistant", content: reply.reply, reply }]);
      if (reply.toolCalls.some((t) => t.name === "searchInstagramProfile" && t.ok)) {
        await Promise.all(ANALYTICS_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof ApiError ? e.message : "The assistant is unavailable right now.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function runAction(a: AssistantAction) {
    switch (a.type) {
      case "openProfile":
        selectProfile(a.username);
        navigate(`/profile/${a.username}`);
        break;
      case "openDate":
        navigate(`/calendar?date=${a.date}`);
        break;
      case "openMonth":
        navigate(`/calendar?month=${a.month}`);
        break;
      case "openHistory":
        navigate("/history");
        break;
      case "openSaved":
        navigate("/saved");
        break;
    }
    onNavigate?.();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4 pr-12">
        <div className="flex items-center gap-2.5">
          <div className="ig-gradient grid size-9 place-items-center rounded-xl text-white">
            <Bot className="size-5" />
          </div>
          <div>
            <p className="font-semibold">AI Assistant</p>
            <p className="text-xs text-muted-foreground">
              {status?.ai.provider === "openai" ? `OpenAI function calling · ${status.ai.model}` : "Built-in command engine"} · answers from backend tools only
            </p>
          </div>
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {!messages.length && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Sparkles className="mb-1 size-4 text-primary" />
              Ask about your tracked profiles. I call the dashboard's backend tools and never invent Instagram data.
              {status?.demoData && (
                <span className="mt-2 block">
                  <DemoBadge dataSource="mock" /> Mock mode — results are demo data.
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => void send(s)} className="cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm",
                m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-muted/40",
                m.error && "border-red-500/40 text-red-600 dark:text-red-400",
              )}
            >
              <p className="whitespace-pre-line">{m.content}</p>
              {m.reply && m.reply.toolCalls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
                  {m.reply.toolCalls.map((t, j) => (
                    <Badge key={j} variant={t.ok ? "secondary" : "danger"} title={JSON.stringify(t.args)} className="font-mono text-[10px]">
                      <Wrench />
                      {t.name}()
                      {t.ok ? <CheckCircle2 /> : <XCircle />}
                    </Badge>
                  ))}
                  <DemoBadge dataSource={m.reply.dataSource} />
                </div>
              )}
              {m.reply && m.reply.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.reply.actions.map((a, j) => (
                    <Button key={j} size="sm" variant="outline" className="h-7 text-xs" onClick={() => runAction(a)}>
                      {actionLabel(a)} <ArrowRight />
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calling backend tools…
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Try "Show @exampleuser analytics"'
          maxLength={500}
          aria-label="Message the AI assistant"
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="icon" className="size-10" disabled={busy || !input.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
    </div>
  );
}
