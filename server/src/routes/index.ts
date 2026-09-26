import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { dayKey, isDayKey, isMonthKey } from "../lib/dates.js";
import { AppError } from "../lib/errors.js";
import { HEX_COLOR_RE } from "../lib/validation.js";
import { assistantLimiter, attachUser, loginLimiter, requireAuth, searchLimiter, tzOf } from "../middleware/index.js";
import {
  REMEMBER_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  changePassword,
  createSessionToken,
  login,
  signOutEverywhere,
  signup,
  signupOpen,
} from "../services/authService.js";
import { CLIENT_ACTIVITY_TYPES, listActivity, logActivity } from "../services/activityService.js";
import { chat } from "../services/ai/assistantService.js";
import { DAILY_METRICS, resolveRange, type RangePreset } from "../services/instagram/analyticsTransforms.js";
import { getInstagramProvider } from "../services/instagram/instagramClient.js";
import {
  getCalendar,
  getDailyAnalytics,
  getDateAnalytics,
  getProfileHistory,
  getSearchDistribution,
  getSummary,
} from "../services/instagram/instagramAnalyticsService.js";
import { listMedia, type MediaFilter } from "../services/instagram/instagramMediaService.js";
import {
  getLatestSnapshot,
  getStoredProfile,
  listProfiles,
  loadMoreMedia,
  refreshProfile,
  searchProfile,
  serializeProfile,
} from "../services/instagram/instagramProfileService.js";
import { demoAvatarSvg, demoThumbSvg } from "../services/instagram/providers/mockProvider.js";
import { listSaved, removeSaved, saveProfile } from "../services/savedProfileService.js";
import { SEARCH_STATUSES, exportSearchHistoryCsv, listSearchHistory, recentSearches } from "../services/searchHistoryService.js";
import { DEFAULT_CHART_COLORS, getChartColors, resetChartColors, updateChartColors } from "../services/settingsService.js";
import { getSystemStatus } from "../services/systemService.js";

type Handler = (req: Request, res: Response) => Promise<unknown>;
/** Wraps async handlers: resolved values become JSON, errors go to the error handler. */
const h =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res)
      .then((body) => {
        if (!res.headersSent && body !== undefined) res.json(body);
      })
      .catch(next);

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const int = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

/** Resolves ?range=today|7d|30d|90d|custom&from&to (or plain from/to) into day keys. */
function rangeOf(req: Request) {
  const tz = tzOf(req);
  const today = dayKey(new Date(), tz);
  const preset = (str(req.query.range) ?? (req.query.from ? "custom" : "7d")) as RangePreset;
  if (!["today", "7d", "30d", "90d", "custom"].includes(preset)) throw new AppError("INVALID_INPUT", "Invalid range.");
  try {
    return { ...resolveRange(preset, today, { from: str(req.query.from), to: str(req.query.to) }), tz };
  } catch (e) {
    throw new AppError("INVALID_INPUT", (e as Error).message);
  }
}

export function buildRouter() {
  const api = Router();

  // ── Public ─────────────────────────────────────────────────────────────
  api.get("/health", (_req, res) => res.json({ ok: true }));

  // ── Dashboard accounts ───────────────────────────────────────────────────
  api.use(attachUser);

  const setSession = (res: Response, userId: string, version: number, remember: boolean) => {
    const ttl = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
    res.cookie(SESSION_COOKIE, createSessionToken(userId, version, ttl), {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      path: "/",
      // Without "remember me" the cookie ends with the browser session (and the token itself expires in 12h).
      ...(remember ? { maxAge: ttl } : {}),
    });
  };
  const clearSession = (res: Response) => res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: env.isProduction });

  api.get(
    "/auth/status",
    h(async (req) => ({ authenticated: Boolean(req.user), user: req.user ?? null, signupOpen: await signupOpen() })),
  );
  api.post(
    "/auth/signup",
    loginLimiter,
    h(async (req, res) => {
      const { user, sessionVersion } = await signup(req.body);
      setSession(res, user.id, sessionVersion, false);
      res.status(201);
      return { authenticated: true, user };
    }),
  );
  api.post(
    "/auth/login",
    loginLimiter,
    h(async (req, res) => {
      const { user, sessionVersion, remember } = await login(req.body);
      setSession(res, user.id, sessionVersion, remember);
      return { authenticated: true, user };
    }),
  );
  api.post("/auth/logout", (_req, res) => {
    clearSession(res);
    res.json({ authenticated: false });
  });
  api.post(
    "/auth/logout-all",
    requireAuth,
    h(async (req, res) => {
      await signOutEverywhere(req.user!.id);
      clearSession(res);
      return { authenticated: false };
    }),
  );
  api.post(
    "/auth/change-password",
    loginLimiter,
    requireAuth,
    h(async (req, res) => {
      const { sessionVersion } = await changePassword(req.user!.id, req.body);
      // Other sessions are revoked; keep this browser signed in with a fresh session.
      setSession(res, req.user!.id, sessionVersion, false);
      return { changed: true };
    }),
  );

  // Synthetic demo images (mock mode only; contain no user data).
  api.get("/demo-assets/avatar/:name", (req, res) => {
    const name = String(req.params.name).replace(/\.svg$/, "").slice(0, 40);
    res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(demoAvatarSvg(name));
  });
  api.get("/demo-assets/thumb/:seed", (req, res) => {
    const seed = String(req.params.seed).replace(/\.svg$/, "");
    if (!/^\d{1,10}$/.test(seed)) return res.status(400).end();
    res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(demoThumbSvg(seed));
  });

  // ── Everything below requires a signed-in dashboard account ────────────
  api.use(requireAuth);

  // Search & profiles
  api.post("/search", searchLimiter, h(async (req) => searchProfile(req.body?.query ?? req.body?.username)));

  api.get("/instagram/profiles", h(async (req) => ({ items: await listProfiles(int(req.query.limit) ?? 50) })));
  api.get(
    "/instagram/profile/:username",
    h(async (req) => {
      const p = await getStoredProfile(String(req.params.username));
      return { dataSource: p.dataSource, profile: serializeProfile(p) };
    }),
  );
  api.get("/instagram/profile/:username/snapshot", h(async (req) => getLatestSnapshot(String(req.params.username))));
  api.get(
    "/instagram/profile/:username/history",
    h(async (req) => {
      const hasRange = req.query.range || req.query.from;
      const r = hasRange ? rangeOf(req) : null;
      return getProfileHistory(String(req.params.username), tzOf(req), r ? { from: r.from, to: r.to } : undefined);
    }),
  );
  api.get(
    "/instagram/profile/:username/media",
    h(async (req) => {
      const p = await getStoredProfile(String(req.params.username));
      const filter = (["all", "posts", "reels"].includes(String(req.query.type)) ? req.query.type : "all") as MediaFilter;
      return listMedia(p.id, { filter, page: int(req.query.page), pageSize: int(req.query.pageSize) });
    }),
  );
  api.post(
    "/instagram/profile/:username/media/more",
    searchLimiter,
    h(async (req) => loadMoreMedia(String(req.params.username))),
  );
  api.post(
    "/instagram/profile/:username/refresh",
    searchLimiter,
    h(async (req) => refreshProfile(String(req.params.username), req.body?.trigger === "live" ? "live" : "manual")),
  );

  // Analytics
  api.get("/analytics/summary", h(async (req) => getSummary(tzOf(req))));
  api.get(
    "/analytics/daily",
    h(async (req) => {
      const metric = str(req.query.metric) ?? "searchCount";
      if (!DAILY_METRICS.includes(metric as never)) throw new AppError("INVALID_INPUT", "Unknown metric.");
      const r = rangeOf(req);
      const username = str(req.query.username)?.replace(/^@/, "").toLowerCase() || undefined;
      return getDailyAnalytics({ metric: metric as never, ...r, username });
    }),
  );
  api.get(
    "/analytics/search-distribution",
    h(async (req) => getSearchDistribution({ ...rangeOf(req), topN: Math.min(int(req.query.top) ?? 6, 12) })),
  );
  api.get(
    "/analytics/date/:date",
    h(async (req) => {
      const date = String(req.params.date);
      if (!isDayKey(date)) throw new AppError("INVALID_INPUT", "Date must be YYYY-MM-DD.");
      return getDateAnalytics(date, tzOf(req));
    }),
  );
  api.get(
    "/calendar",
    h(async (req) => {
      const tz = tzOf(req);
      const month = str(req.query.month) ?? dayKey(new Date(), tz).slice(0, 7);
      if (!isMonthKey(month)) throw new AppError("INVALID_INPUT", "Month must be YYYY-MM.");
      return getCalendar(month, tz);
    }),
  );

  // Search history
  const historyFilters = (req: Request) => {
    const status = str(req.query.status);
    if (status && !SEARCH_STATUSES.includes(status as never)) throw new AppError("INVALID_INPUT", "Unknown status.");
    const from = str(req.query.from);
    const to = str(req.query.to);
    if ((from && !isDayKey(from)) || (to && !isDayKey(to))) throw new AppError("INVALID_INPUT", "Dates must be YYYY-MM-DD.");
    return {
      username: str(req.query.username)?.slice(0, 64),
      status: status as never,
      from: from && to ? from : from ?? undefined,
      to: from && to ? to : from ?? undefined,
      tz: tzOf(req),
    };
  };
  api.get(
    "/search-history",
    h(async (req) => listSearchHistory({ ...historyFilters(req), page: int(req.query.page), pageSize: int(req.query.pageSize) })),
  );
  api.get(
    "/search-history/export.csv",
    h(async (req, res) => {
      const csv = await exportSearchHistoryCsv(historyFilters(req));
      await logActivity(getInstagramProvider().dataSource, "export_csv");
      res
        .type("text/csv; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="instagram-search-history-${dayKey(new Date(), tzOf(req))}.csv"`)
        .send("﻿" + csv);
      return undefined;
    }),
  );
  api.get("/search-history/recent", h(async (req) => ({ items: await recentSearches(str(req.query.q), int(req.query.limit) ?? 8) })));

  // Saved profiles
  api.get("/saved-profiles", h(async () => ({ items: await listSaved() })));
  api.post(
    "/saved-profiles",
    h(async (req, res) => {
      const username = str(req.body?.username);
      if (!username) throw new AppError("INVALID_INPUT", "username is required.");
      res.status(201);
      return saveProfile(username);
    }),
  );
  api.delete("/saved-profiles/:id", h(async (req) => removeSaved(String(req.params.id))));

  // Activity timeline
  api.get(
    "/activity",
    h(async (req) => ({
      items: await listActivity(getInstagramProvider().dataSource, {
        limit: int(req.query.limit),
        username: str(req.query.username)?.replace(/^@/, "").toLowerCase(),
      }),
    })),
  );
  api.post(
    "/activity",
    h(async (req, res) => {
      const body = z
        .object({
          type: z.enum(CLIENT_ACTIVITY_TYPES as [string, ...string[]]),
          username: z.string().regex(/^[a-z0-9._]{1,30}$/).optional(),
          detail: z.string().max(200).optional(),
        })
        .parse(req.body ?? {});
      const dataSource = getInstagramProvider().dataSource;
      let profileId: string | null = null;
      if (body.username) {
        const p = await getStoredProfile(body.username).catch(() => null);
        profileId = p?.id ?? null;
      }
      await logActivity(dataSource, body.type as never, { username: body.username, profileId, detail: body.detail });
      res.status(201);
      return { ok: true };
    }),
  );

  // Chart color settings
  api.get("/settings/chart-colors", h(async () => ({ colors: await getChartColors(), defaults: DEFAULT_CHART_COLORS })));
  api.put(
    "/settings/chart-colors",
    h(async (req) => {
      const hex = z.string().regex(HEX_COLOR_RE, "Colors must be 6-digit hex values like #6366F1");
      const body = z
        .object({ primary: hex, secondary: hex, success: hex, warning: hex, danger: hex, info: hex, accent: hex })
        .partial()
        .strict()
        .safeParse(req.body ?? {});
      if (!body.success) throw new AppError("INVALID_INPUT", body.error.issues[0]?.message ?? "Invalid colors.");
      return { colors: await updateChartColors(body.data) };
    }),
  );
  api.post("/settings/chart-colors/reset", h(async () => ({ colors: await resetChartColors() })));

  // AI assistant
  api.post(
    "/assistant/chat",
    assistantLimiter,
    h(async (req) => {
      const body = z
        .object({
          message: z.string().trim().min(1).max(500),
          history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).optional(),
        })
        .safeParse(req.body ?? {});
      if (!body.success) throw new AppError("INVALID_INPUT", "Message must be 1–500 characters.");
      return chat({ ...body.data, tz: tzOf(req) });
    }),
  );

  // System
  api.get("/system/status", h(async () => getSystemStatus()));

  return api;
}
