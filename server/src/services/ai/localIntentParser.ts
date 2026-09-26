import { addDays, isDayKey } from "../../lib/dates.js";
import type { ToolContext, ToolName } from "./tools.js";

/**
 * Deterministic command parser used when no OpenAI key is configured (and as a
 * fallback if the LLM call fails). It maps natural phrasing to the same backend
 * tools the LLM would call.
 */
export interface PlannedCall {
  tool: ToolName;
  args: Record<string, unknown>;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthIndex = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3)));
const USER = "@?([a-z0-9._]{1,30})";

export function parseDateRange(text: string, ctx: ToolContext): { from: string; to: string } | { date: string } | { month: string } | null {
  const t = text.toLowerCase();
  if (/\btoday\b/.test(t)) return { date: ctx.today };
  if (/\byesterday\b/.test(t)) return { date: addDays(ctx.today, -1) };
  if (/\b(this|past|last)\s+week\b|\b7\s*days\b/.test(t)) return { from: addDays(ctx.today, -6), to: ctx.today };
  if (/\b(last|past)\s+30\s*days\b|\bthis\s+month\b/.test(t)) {
    if (/this\s+month/.test(t)) return { month: ctx.today.slice(0, 7) };
    return { from: addDays(ctx.today, -29), to: ctx.today };
  }
  if (/\b(last|past)\s+90\s*days\b/.test(t)) return { from: addDays(ctx.today, -89), to: ctx.today };

  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && isDayKey(iso[1])) return { date: iso[1]! };

  // "26 sep 2026", "26 september"
  const dmy = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/);
  if (dmy) {
    const m = monthIndex(dmy[2]!);
    const y = dmy[3] ?? ctx.today.slice(0, 4);
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
    if (isDayKey(key)) return { date: key };
  }
  // "september 26, 2026"
  const mdy = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?\b/);
  if (mdy) {
    const m = monthIndex(mdy[1]!);
    const y = mdy[3] ?? ctx.today.slice(0, 4);
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${mdy[2]!.padStart(2, "0")}`;
    if (isDayKey(key)) return { date: key };
  }
  // "september 2026" / "sep 2026"
  const my = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/);
  if (my) return { month: `${my[2]}-${String(monthIndex(my[1]!) + 1).padStart(2, "0")}` };
  return null;
}

export function planCalls(message: string, ctx: ToolContext): PlannedCall[] {
  const t = message.trim().toLowerCase();
  const range = parseDateRange(t, ctx);

  let m = t.match(new RegExp(`^(?:please\\s+)?(?:search|look\\s*up|find|check)\\s+(?:for\\s+)?(?:profile\\s+)?${USER}\\s*$`));
  if (m) return [{ tool: "searchInstagramProfile", args: { username: m[1] } }];

  if (/\bsaved\b/.test(t)) return [{ tool: "getSavedProfiles", args: {} }];

  if (/\b(most|top)\b.*\b(searched|checked|viewed|popular)\b|\bmost searched\b/.test(t)) {
    const r = range && "from" in range ? range : range && "date" in range ? { from: range.date, to: range.date } : range && "month" in range ? monthToRange(range.month) : { from: addDays(ctx.today, -6), to: ctx.today };
    return [{ tool: "getTopProfiles", args: { ...r, limit: 5 } }];
  }

  // "@user analytics", "analytics for @user", "profile tracking for @user", "history of @user"
  m =
    t.match(new RegExp(`(?:analytics|tracking|history|snapshots?|stats|trend)\\s+(?:for|of|on)\\s+${USER}`)) ??
    t.match(new RegExp(`@([a-z0-9._]{1,30})\\s+(?:analytics|tracking|history|stats|profile)`)) ??
    t.match(/@([a-z0-9._]{1,30})/);
  if (m && !/\bsearch\b/.test(t.replace(/searched|searches/g, ""))) {
    const args: Record<string, unknown> = { username: m[1] };
    if (range && "from" in range) Object.assign(args, range);
    return [
      { tool: "getProfileSnapshot", args: { username: m[1] } },
      { tool: "getProfileHistory", args },
    ];
  }
  if (m) return [{ tool: "searchInstagramProfile", args: { username: m[1] } }];

  if (range && "month" in range) return [{ tool: "getMonthActivity", args: { month: range.month } }];
  if (range && "date" in range && /\b(search|searched|searches|profiles|activity|checked)\b/.test(t))
    return [{ tool: "getDateAnalytics", args: { date: range.date } }];
  if (range && "from" in range && /\b(search|searched|searches|activity)\b/.test(t))
    return [{ tool: "getDailyAnalytics", args: { metric: "searchCount", ...range } }];
  if (/\b(history|recent searches|last searches)\b/.test(t)) return [{ tool: "getSearchHistory", args: { limit: 10 } }];
  if (range && "date" in range) return [{ tool: "getDateAnalytics", args: { date: range.date } }];

  return [];
}

function monthToRange(month: string) {
  const [y, mo] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export const HELP_TEXT = `I can answer using your stored Instagram data. Try:
• "Search @exampleuser"
• "Show @exampleuser analytics"
• "Show today's searches" / "Show profiles searched today"
• "Show me the profile tracking for @exampleuser"
• "Show my most searched profiles this week"
• "Show profile activity for September 2026"
• "Show my saved profiles"`;
