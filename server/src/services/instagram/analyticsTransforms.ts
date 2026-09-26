/**
 * Pure analytics transformations (no I/O) — unit tested in tests/analyticsTransforms.test.ts.
 */
import { addDays, dayKey, eachDay, isDayKey } from "../../lib/dates.js";

export const DAILY_METRICS = [
  "searchCount",
  "followers",
  "following",
  "mediaCount",
  "reelCount",
  "profileChecks",
] as const;
export type DailyMetric = (typeof DAILY_METRICS)[number];

/** Metrics read from snapshots of a single profile (require a username). */
export const SNAPSHOT_METRICS: DailyMetric[] = ["followers", "following", "mediaCount", "reelCount"];

export interface DayPoint {
  date: string;
  value: number | null;
}

export type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";

export function resolveRange(
  preset: RangePreset,
  today: string,
  custom?: { from?: string; to?: string },
): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "custom": {
      const from = custom?.from;
      const to = custom?.to;
      if (!isDayKey(from) || !isDayKey(to)) throw new Error("Custom range needs from/to as YYYY-MM-DD.");
      if (from > to) throw new Error("`from` must be on or before `to`.");
      if (eachDay(from, to, 367).length > 366) throw new Error("Custom range is limited to 366 days.");
      return { from, to };
    }
  }
}

/** Count events per local day; days with no events are real zeros. */
export function bucketCountsByDay(timestamps: Date[], days: string[], tz: string): DayPoint[] {
  const counts = new Map<string, number>(days.map((d) => [d, 0]));
  for (const t of timestamps) {
    const k = dayKey(t, tz);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return days.map((d) => ({ date: d, value: counts.get(d)! }));
}

/**
 * Last observed value per local day. Days without a stored snapshot are `null`
 * (rendered as gaps) — values are never interpolated or invented.
 */
export function lastValuePerDay(
  snapshots: { capturedAt: Date; value: number | null }[],
  days: string[],
  tz: string,
): DayPoint[] {
  const last = new Map<string, { at: number; value: number | null }>();
  for (const s of snapshots) {
    if (s.value === null || s.value === undefined) continue;
    const k = dayKey(s.capturedAt, tz);
    const prev = last.get(k);
    if (!prev || s.capturedAt.getTime() >= prev.at) last.set(k, { at: s.capturedAt.getTime(), value: s.value });
  }
  return days.map((d) => ({ date: d, value: last.get(d)?.value ?? null }));
}

export interface DistributionSlice {
  username: string;
  count: number;
  percent: number;
}

/**
 * Top-N usernames by search count plus an "Others" slice. Percentages use the
 * largest-remainder method so they always sum to exactly 100.
 */
export function buildDistribution(counts: { username: string; count: number }[], topN = 6): DistributionSlice[] {
  const sorted = counts.filter((c) => c.count > 0).sort((a, b) => b.count - a.count || a.username.localeCompare(b.username));
  const total = sorted.reduce((s, c) => s + c.count, 0);
  if (!total) return [];
  const head = sorted.slice(0, topN);
  const restCount = sorted.slice(topN).reduce((s, c) => s + c.count, 0);
  const slices = restCount ? [...head, { username: "Others", count: restCount }] : head;

  const raw = slices.map((s) => (s.count / total) * 100);
  const floored = raw.map(Math.floor);
  let remaining = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floored[i]! += 1;
    remaining -= 1;
  }
  return slices.map((s, i) => ({ username: s.username, count: s.count, percent: floored[i]! }));
}

export interface CalendarDay {
  date: string;
  searches: number;
  profiles: number;
  usernames: string[];
}

export function buildCalendar(events: { searchedAt: Date; searchedUsername: string }[], tz: string): CalendarDay[] {
  const byDay = new Map<string, { searches: number; users: Map<string, number> }>();
  for (const e of events) {
    const k = dayKey(e.searchedAt, tz);
    const d = byDay.get(k) ?? { searches: 0, users: new Map() };
    d.searches += 1;
    d.users.set(e.searchedUsername, (d.users.get(e.searchedUsername) ?? 0) + 1);
    byDay.set(k, d);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      searches: d.searches,
      profiles: d.users.size,
      usernames: [...d.users.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u),
    }));
}

export interface HistoryRow {
  date: string;
  followers: number | null;
  following: number | null;
  media: number | null;
  reels: number | null;
  searches: number;
  snapshots: number;
}

/**
 * Date-wise profile history: one row per local day on which data was actually
 * captured or the profile was searched. Metric columns come from that day's last
 * snapshot; they are null if no snapshot exists for the day.
 */
export function buildProfileHistory(
  snapshots: {
    capturedAt: Date;
    followersCount: number | null;
    followingCount: number | null;
    mediaCount: number | null;
    reelCount: number | null;
  }[],
  searches: { searchedAt: Date }[],
  tz: string,
): HistoryRow[] {
  const rows = new Map<string, HistoryRow & { at: number }>();
  const get = (k: string) => {
    let r = rows.get(k);
    if (!r) {
      r = { date: k, followers: null, following: null, media: null, reels: null, searches: 0, snapshots: 0, at: -1 };
      rows.set(k, r);
    }
    return r;
  };
  for (const s of snapshots) {
    const r = get(dayKey(s.capturedAt, tz));
    r.snapshots += 1;
    if (s.capturedAt.getTime() >= r.at) {
      r.at = s.capturedAt.getTime();
      r.followers = s.followersCount;
      r.following = s.followingCount;
      r.media = s.mediaCount;
      r.reels = s.reelCount;
    }
  }
  for (const e of searches) get(dayKey(e.searchedAt, tz)).searches += 1;
  return [...rows.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ at: _at, ...r }) => r);
}
