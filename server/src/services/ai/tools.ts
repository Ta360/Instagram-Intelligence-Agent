import { z } from "zod";
import { addDays, dayKey, isDayKey, isMonthKey, monthRange } from "../../lib/dates.js";
import { DAILY_METRICS } from "../instagram/analyticsTransforms.js";
import {
  getCalendar,
  getDailyAnalytics,
  getDateAnalytics,
  getProfileHistory,
  getSearchDistribution,
} from "../instagram/instagramAnalyticsService.js";
import { getLatestSnapshot, searchProfile } from "../instagram/instagramProfileService.js";
import { listSaved } from "../savedProfileService.js";
import { SEARCH_STATUSES, listSearchHistory } from "../searchHistoryService.js";

/**
 * Backend tools the AI assistant may call. Every answer about Instagram data
 * comes from one of these — the assistant never invents values.
 */
export interface ToolContext {
  tz: string;
  today: string;
}

const username = z
  .string()
  .min(1)
  .max(64)
  .transform((s) => s.trim().replace(/^@/, "").toLowerCase());
const day = z.string().refine(isDayKey, "Expected YYYY-MM-DD");

function defaultRange(ctx: ToolContext, from?: string, to?: string) {
  return { from: from ?? addDays(ctx.today, -6), to: to ?? ctx.today };
}

export const TOOLS = {
  searchInstagramProfile: {
    description: "Search an Instagram username or numeric User ID through the configured Instagram API. Stores a search event and a historical snapshot.",
    schema: z.object({ username }),
    parameters: { type: "object", properties: { username: { type: "string", description: "Instagram username (with or without @) or numeric User ID" } }, required: ["username"] },
    run: async (a: { username: string }) => {
      const r = await searchProfile(a.username);
      return { dataSource: r.dataSource, profile: r.profile, mediaReturned: r.media.length, reelsReturned: r.media.filter((m) => m.isReel).length, fromCache: r.fromCache };
    },
  },
  getProfileSnapshot: {
    description: "Get the stored profile and its most recent snapshot (no new API call).",
    schema: z.object({ username }),
    parameters: { type: "object", properties: { username: { type: "string" } }, required: ["username"] },
    run: async (a: { username: string }) => getLatestSnapshot(a.username),
  },
  getSearchHistory: {
    description: "List recent search events, optionally filtered by username, status or date range.",
    schema: z.object({
      username: username.optional(),
      status: z.enum(SEARCH_STATUSES as [string, ...string[]]).optional(),
      from: day.optional(),
      to: day.optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        username: { type: "string" },
        status: { type: "string", enum: SEARCH_STATUSES },
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
    run: async (a: { username?: string; status?: string; from?: string; to?: string; limit?: number }, ctx: ToolContext) => {
      const r = await listSearchHistory({
        username: a.username,
        status: a.status as never,
        from: a.from && a.to ? a.from : undefined,
        to: a.from && a.to ? a.to : undefined,
        tz: ctx.tz,
        pageSize: a.limit ?? 15,
      });
      return { total: r.total, items: r.items };
    },
  },
  getProfileHistory: {
    description: "Date-wise historical tracking for one profile: followers, following, media, reels and searches per day, from stored snapshots only.",
    schema: z.object({ username, from: day.optional(), to: day.optional() }),
    parameters: { type: "object", properties: { username: { type: "string" }, from: { type: "string" }, to: { type: "string" } }, required: ["username"] },
    run: async (a: { username: string; from?: string; to?: string }, ctx: ToolContext) => {
      const r = await getProfileHistory(a.username, ctx.tz, a.from && a.to ? { from: a.from, to: a.to } : undefined);
      return { profile: { username: r.profile.username, displayName: r.profile.displayName, dataSource: r.profile.dataSource }, rows: r.rows.slice(0, 60) };
    },
  },
  getDailyAnalytics: {
    description: "Daily series for a metric over a date range. Snapshot metrics (followers, following, mediaCount, reelCount) require a username.",
    schema: z.object({ metric: z.enum(DAILY_METRICS), from: day.optional(), to: day.optional(), username: username.optional() }),
    parameters: {
      type: "object",
      properties: { metric: { type: "string", enum: DAILY_METRICS }, from: { type: "string" }, to: { type: "string" }, username: { type: "string" } },
      required: ["metric"],
    },
    run: async (a: { metric: (typeof DAILY_METRICS)[number]; from?: string; to?: string; username?: string }, ctx: ToolContext) =>
      getDailyAnalytics({ metric: a.metric, ...defaultRange(ctx, a.from, a.to), tz: ctx.tz, username: a.username }),
  },
  getDateAnalytics: {
    description: "Everything recorded on one date: total searches, profiles checked, usernames and snapshots.",
    schema: z.object({ date: day }),
    parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] },
    run: async (a: { date: string }, ctx: ToolContext) => getDateAnalytics(a.date, ctx.tz),
  },
  getTopProfiles: {
    description: "Most searched profiles in a date range, with counts and percentages.",
    schema: z.object({ from: day.optional(), to: day.optional(), limit: z.number().int().min(1).max(20).optional() }),
    parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, limit: { type: "integer" } } },
    run: async (a: { from?: string; to?: string; limit?: number }, ctx: ToolContext) =>
      getSearchDistribution({ ...defaultRange(ctx, a.from, a.to), tz: ctx.tz, topN: a.limit ?? 5 }),
  },
  getMonthActivity: {
    description: "Per-day search activity for a calendar month (YYYY-MM).",
    schema: z.object({ month: z.string().refine(isMonthKey, "Expected YYYY-MM") }),
    parameters: { type: "object", properties: { month: { type: "string", description: "YYYY-MM" } }, required: ["month"] },
    run: async (a: { month: string }, ctx: ToolContext) => {
      const cal = await getCalendar(a.month, ctx.tz);
      const { from, to } = monthRange(a.month);
      const dist = await getSearchDistribution({ from, to, tz: ctx.tz, topN: 5 });
      return { ...cal, totalSearches: dist.total, topProfiles: dist.slices };
    },
  },
  getSavedProfiles: {
    description: "List saved profiles.",
    schema: z.object({}),
    parameters: { type: "object", properties: {} },
    run: async () => {
      const rows = await listSaved();
      return rows.map((r) => ({ username: r.profile.username, displayName: r.profile.displayName, followersCount: r.profile.followersCount, lastCheckedAt: r.profile.lastCheckedAt }));
    },
  },
} as const;

export type ToolName = keyof typeof TOOLS;

export function isToolName(n: string): n is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOLS, n);
}

export async function runTool(name: ToolName, rawArgs: unknown, ctx: ToolContext): Promise<unknown> {
  const tool = TOOLS[name];
  const args = tool.schema.parse(rawArgs ?? {});
  return (tool.run as (a: unknown, c: ToolContext) => Promise<unknown>)(args, ctx);
}

export function openAiToolDefinitions() {
  return (Object.keys(TOOLS) as ToolName[]).map((name) => ({
    type: "function" as const,
    function: { name, description: TOOLS[name].description, parameters: TOOLS[name].parameters },
  }));
}

export function makeContext(tz: string): ToolContext {
  return { tz, today: dayKey(new Date(), tz) };
}
