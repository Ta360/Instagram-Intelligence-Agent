import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { logActivity } from "../activityService.js";
import { getInstagramProvider } from "../instagram/instagramClient.js";
import { HELP_TEXT, planCalls } from "./localIntentParser.js";
import { isToolName, makeContext, openAiToolDefinitions, runTool, type ToolContext, type ToolName } from "./tools.js";

export interface ToolTrace {
  name: ToolName;
  args: Record<string, unknown>;
  ok: boolean;
  error?: string;
}
export type AssistantAction =
  | { type: "openProfile"; username: string }
  | { type: "openDate"; date: string }
  | { type: "openMonth"; month: string }
  | { type: "openHistory" }
  | { type: "openSaved" };

export interface AssistantReply {
  reply: string;
  engine: "openai" | "local";
  dataSource: "mock" | "production";
  toolCalls: ToolTrace[];
  actions: AssistantAction[];
  data: { tool: ToolName; result: unknown }[];
}

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : n.toLocaleString("en-US"));

function actionFor(name: ToolName, args: Record<string, unknown>, result: unknown): AssistantAction | null {
  const r = result as { profile?: { username?: string } };
  switch (name) {
    case "searchInstagramProfile":
    case "getProfileSnapshot":
    case "getProfileHistory":
      return r?.profile?.username ? { type: "openProfile", username: r.profile.username } : null;
    case "getDateAnalytics":
      return { type: "openDate", date: String(args.date) };
    case "getMonthActivity":
      return { type: "openMonth", month: String(args.month) };
    case "getSearchHistory":
      return { type: "openHistory" };
    case "getSavedProfiles":
      return { type: "openSaved" };
    default:
      return null;
  }
}

/** Plain-language summaries of tool results (used by the local engine). */
function summarize(name: ToolName, result: any): string {
  switch (name) {
    case "searchInstagramProfile": {
      const p = result.profile;
      return `Found @${p.username}${p.displayName ? ` (${p.displayName})` : ""}: ${fmt(p.followersCount)} followers, ${fmt(p.followingCount)} following, ${fmt(p.mediaCount)} posts. ${result.mediaReturned} media items accessible (${result.reelsReturned} reels).${result.fromCache ? " (served from cache)" : " A new snapshot was stored."}`;
    }
    case "getProfileSnapshot": {
      const s = result.snapshot;
      if (!s) return `@${result.profile.username} has no stored snapshots yet.`;
      return `Latest snapshot for @${result.profile.username} (${new Date(s.capturedAt).toLocaleString("en-US")}): ${fmt(s.followersCount)} followers, ${fmt(s.followingCount)} following, ${fmt(s.mediaCount)} posts, ${fmt(s.reelCount)} accessible reels.`;
    }
    case "getProfileHistory": {
      if (!result.rows.length) return `No historical data stored for @${result.profile.username} yet.`;
      const lines = result.rows
        .slice(0, 10)
        .map((r: any) => `${r.date}: followers ${fmt(r.followers)}, following ${fmt(r.following)}, media ${fmt(r.media)}, searches ${r.searches}`);
      return `Historical tracking for @${result.profile.username} (${result.rows.length} day${result.rows.length === 1 ? "" : "s"} recorded):\n${lines.join("\n")}`;
    }
    case "getDateAnalytics": {
      if (!result.totalSearches) return `No searches were recorded on ${result.date}.`;
      const users = result.profiles.map((p: any) => `@${p.username} (${p.searches})`).join(", ");
      return `On ${result.date}: ${result.totalSearches} search${result.totalSearches === 1 ? "" : "es"} across ${result.profilesChecked} profile${result.profilesChecked === 1 ? "" : "s"} — ${users}. ${result.snapshots.length} snapshot(s) captured.`;
    }
    case "getTopProfiles": {
      if (!result.slices.length) return `No searches between ${result.from} and ${result.to}.`;
      return `Most searched profiles ${result.from} → ${result.to} (${result.total} searches):\n${result.slices.map((s: any, i: number) => `${i + 1}. ${s.username === "Others" ? "Others" : "@" + s.username} — ${s.count} (${s.percent}%)`).join("\n")}`;
    }
    case "getMonthActivity": {
      if (!result.days.length) return `No profile activity recorded in ${result.month}.`;
      const busiest = [...result.days].sort((a: any, b: any) => b.searches - a.searches)[0];
      return `${result.month}: ${result.totalSearches} searches on ${result.days.length} day(s). Busiest day ${busiest.date} with ${busiest.searches} searches. Top profiles: ${result.topProfiles.map((s: any) => (s.username === "Others" ? "Others" : "@" + s.username) + ` (${s.count})`).join(", ")}.`;
    }
    case "getDailyAnalytics": {
      const pts = result.points.filter((p: any) => p.value !== null);
      const total = pts.reduce((s: number, p: any) => s + p.value, 0);
      return `${result.metric} from ${result.from} to ${result.to}${result.username ? ` for @${result.username}` : ""}: ${result.metric === "searchCount" || result.metric === "profileChecks" ? `${total} total` : `${pts.length} day(s) with data`}.`;
    }
    case "getSearchHistory": {
      if (!result.items.length) return "No searches recorded yet.";
      return `Last ${result.items.length} of ${result.total} searches:\n${result.items
        .map((e: any) => `${new Date(e.searchedAt).toLocaleString("en-US")} — @${e.username} (${e.status})`)
        .join("\n")}`;
    }
    case "getSavedProfiles": {
      if (!result.length) return "You have no saved profiles yet.";
      return `Saved profiles (${result.length}): ${result.map((p: any) => `@${p.username}`).join(", ")}.`;
    }
  }
}

async function execute(name: ToolName, args: Record<string, unknown>, ctx: ToolContext) {
  try {
    const result = await runTool(name, args, ctx);
    return { ok: true as const, result };
  } catch (err) {
    const msg = err instanceof AppError ? err.userMessage : err instanceof Error && err.name === "ZodError" ? "Invalid tool arguments." : "Tool failed.";
    return { ok: false as const, error: msg };
  }
}

async function runLocal(message: string, ctx: ToolContext): Promise<Omit<AssistantReply, "dataSource">> {
  const plan = planCalls(message, ctx);
  if (!plan.length) return { reply: HELP_TEXT, engine: "local", toolCalls: [], actions: [], data: [] };

  const traces: ToolTrace[] = [];
  const parts: string[] = [];
  const actions: AssistantAction[] = [];
  const data: AssistantReply["data"] = [];
  for (const call of plan) {
    const out = await execute(call.tool, call.args, ctx);
    traces.push({ name: call.tool, args: call.args, ok: out.ok, ...(out.ok ? {} : { error: out.error }) });
    if (out.ok) {
      data.push({ tool: call.tool, result: out.result });
      parts.push(summarize(call.tool, out.result));
      const a = actionFor(call.tool, call.args, out.result);
      if (a && !actions.some((x) => JSON.stringify(x) === JSON.stringify(a))) actions.push(a);
    } else {
      parts.push(out.error!);
      break;
    }
  }
  return { reply: parts.join("\n\n"), engine: "local", toolCalls: traces, actions, data };
}

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

async function runOpenAI(message: string, history: { role: "user" | "assistant"; content: string }[], ctx: ToolContext) {
  const dataSource = getInstagramProvider().dataSource;
  const messages: ChatMsg[] = [
    {
      role: "system",
      content: [
        "You are the Instagram Intelligence Agent assistant inside an analytics dashboard.",
        "Answer ONLY using results returned by the provided tools. Never invent profiles, counts, dates or analytics.",
        "If a tool returns an error or no data, say so plainly. Private or personal accounts are not accessible — do not suggest workarounds.",
        `Today is ${ctx.today} (timezone ${ctx.tz}). Resolve relative dates ("today", "this week" = last 7 days) to YYYY-MM-DD.`,
        dataSource === "mock" ? "The app is in MOCK MODE: all data is DEMO DATA; mention this when reporting numbers." : "The app is using the authorized Instagram Graph API.",
        "Be concise. Reply in plain text only — no Markdown headings, bold or tables; use simple '-' bullets or numbered lines for lists. Refer to usernames with @.",
      ].join(" "),
    },
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }) as ChatMsg),
    { role: "user", content: message },
  ];

  const traces: ToolTrace[] = [];
  const actions: AssistantAction[] = [];
  const data: AssistantReply["data"] = [];

  for (let step = 0; step < 5; step++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.openai.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.openai.model, messages, tools: openAiToolDefinitions(), tool_choice: "auto", temperature: 0.2 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const body = (await res.json()) as { choices: { message: ChatMsg }[] };
    const msg = body.choices[0]!.message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      return { reply: msg.content ?? "", engine: "openai" as const, toolCalls: traces, actions, data };
    }
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        /* keep empty */
      }
      const name = tc.function.name;
      if (!isToolName(name)) {
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: "Unknown tool" }) });
        continue;
      }
      const out = await execute(name, args, ctx);
      traces.push({ name, args, ok: out.ok, ...(out.ok ? {} : { error: out.error }) });
      if (out.ok) {
        data.push({ tool: name, result: out.result });
        const a = actionFor(name, args, out.result);
        if (a && !actions.some((x) => JSON.stringify(x) === JSON.stringify(a))) actions.push(a);
      }
      const payload = JSON.stringify(out.ok ? out.result : { error: out.error });
      messages.push({ role: "tool", tool_call_id: tc.id, content: payload.slice(0, 12_000) });
    }
  }
  return { reply: "I couldn't complete that request in a reasonable number of steps.", engine: "openai" as const, toolCalls: traces, actions, data };
}

export async function chat(input: { message: string; history?: { role: "user" | "assistant"; content: string }[]; tz: string }): Promise<AssistantReply> {
  const ctx = makeContext(input.tz);
  const dataSource = getInstagramProvider().dataSource;
  await logActivity(dataSource, "assistant_query", { detail: input.message.slice(0, 120) });

  if (env.openai.apiKey) {
    try {
      const r = await runOpenAI(input.message, input.history ?? [], ctx);
      return { ...r, dataSource };
    } catch (err) {
      logger.warn("assistant.openai_failed", { error: String((err as Error)?.message ?? err) });
      // Fall back to the deterministic parser, which calls the same tools.
    }
  }
  const r = await runLocal(input.message, ctx);
  return { ...r, dataSource };
}
