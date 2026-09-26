import type { Prisma } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { dayKey, eachDay, monthRange, startOfZonedDay, zonedRange } from "../../lib/dates.js";
import { prisma } from "../../lib/prisma.js";
import { getInstagramProvider } from "./instagramClient.js";
import { getStoredProfile, serializeProfile } from "./instagramProfileService.js";
import {
  SNAPSHOT_METRICS,
  bucketCountsByDay,
  buildCalendar,
  buildDistribution,
  buildProfileHistory,
  lastValuePerDay,
  type DailyMetric,
} from "./analyticsTransforms.js";

const mode = () => getInstagramProvider().dataSource;

export async function getSummary(tz: string) {
  const dataSource = mode();
  const todayStart = startOfZonedDay(dayKey(new Date(), tz), tz);
  const [totalSearches, profilesTracked, searchesToday, mediaAvailable, lastSearch, savedCount] = await Promise.all([
    prisma.searchEvent.count({ where: { dataSource } }),
    prisma.instagramProfile.count({ where: { dataSource } }),
    prisma.searchEvent.count({ where: { dataSource, searchedAt: { gte: todayStart } } }),
    prisma.mediaItem.count({
      where: { profile: { dataSource }, OR: [{ mediaType: "VIDEO" }, { productType: "REELS" }] },
    }),
    prisma.searchEvent.findFirst({ where: { dataSource }, orderBy: { searchedAt: "desc" } }),
    prisma.savedProfile.count({ where: { profile: { dataSource } } }),
  ]);
  return {
    dataSource,
    totalSearches,
    profilesTracked,
    searchesToday,
    mediaAvailable,
    savedProfiles: savedCount,
    lastSearch: lastSearch
      ? { username: lastSearch.searchedUsername, searchedAt: lastSearch.searchedAt.toISOString(), status: lastSearch.status }
      : null,
  };
}

export async function getDailyAnalytics(opts: { metric: DailyMetric; from: string; to: string; tz: string; username?: string }) {
  const dataSource = mode();
  const { metric, from, to, tz } = opts;
  const days = eachDay(from, to);
  const { start, end } = zonedRange(from, to, tz);
  const inRange = { gte: start, lt: end };

  if (metric === "searchCount") {
    const where: Prisma.SearchEventWhereInput = { dataSource, searchedAt: inRange };
    if (opts.username) where.searchedUsername = opts.username;
    const rows = await prisma.searchEvent.findMany({ where, select: { searchedAt: true } });
    return { metric, from, to, username: opts.username ?? null, points: bucketCountsByDay(rows.map((r) => r.searchedAt), days, tz) };
  }

  if (metric === "profileChecks") {
    const where: Prisma.ProfileSnapshotWhereInput = { dataSource, capturedAt: inRange };
    if (opts.username) where.profile = { username: opts.username };
    const rows = await prisma.profileSnapshot.findMany({ where, select: { capturedAt: true } });
    return { metric, from, to, username: opts.username ?? null, points: bucketCountsByDay(rows.map((r) => r.capturedAt), days, tz) };
  }

  if (SNAPSHOT_METRICS.includes(metric)) {
    if (!opts.username) throw new AppError("INVALID_INPUT", "Select a profile to chart snapshot metrics.");
    const profile = await getStoredProfile(opts.username);
    const field = {
      followers: "followersCount",
      following: "followingCount",
      mediaCount: "mediaCount",
      reelCount: "reelCount",
    }[metric as "followers" | "following" | "mediaCount" | "reelCount"] as
      | "followersCount"
      | "followingCount"
      | "mediaCount"
      | "reelCount";
    const rows = await prisma.profileSnapshot.findMany({
      where: { profileId: profile.id, capturedAt: inRange },
      select: { capturedAt: true, [field]: true },
      orderBy: { capturedAt: "asc" },
    });
    const snaps = rows.map((r) => ({ capturedAt: r.capturedAt, value: (r as Record<string, unknown>)[field] as number | null }));
    return { metric, from, to, username: profile.username, points: lastValuePerDay(snaps, days, tz) };
  }

  throw new AppError("INVALID_INPUT", "Unknown metric.");
}

export async function getSearchDistribution(opts: { from: string; to: string; tz: string; topN?: number }) {
  const { start, end } = zonedRange(opts.from, opts.to, opts.tz);
  const grouped = await prisma.searchEvent.groupBy({
    by: ["searchedUsername"],
    where: { dataSource: mode(), searchedAt: { gte: start, lt: end } },
    _count: { _all: true },
  });
  const counts = grouped.map((g) => ({ username: g.searchedUsername, count: g._count._all }));
  const total = counts.reduce((s, c) => s + c.count, 0);
  return { from: opts.from, to: opts.to, total, slices: buildDistribution(counts, opts.topN ?? 6) };
}

export async function getCalendar(month: string, tz: string) {
  const { from, to } = monthRange(month);
  const { start, end } = zonedRange(from, to, tz);
  const events = await prisma.searchEvent.findMany({
    where: { dataSource: mode(), searchedAt: { gte: start, lt: end } },
    select: { searchedAt: true, searchedUsername: true },
  });
  return { month, days: buildCalendar(events, tz) };
}

export async function getDateAnalytics(date: string, tz: string) {
  const dataSource = mode();
  const { start, end } = zonedRange(date, date, tz);
  const [events, snapshots, activity] = await Promise.all([
    prisma.searchEvent.findMany({
      where: { dataSource, searchedAt: { gte: start, lt: end } },
      orderBy: { searchedAt: "asc" },
    }),
    prisma.profileSnapshot.findMany({
      where: { dataSource, capturedAt: { gte: start, lt: end } },
      orderBy: { capturedAt: "asc" },
      include: { profile: { select: { username: true, displayName: true } } },
    }),
    prisma.activityEvent.count({ where: { dataSource, occurredAt: { gte: start, lt: end } } }),
  ]);

  const perUser = new Map<string, { username: string; searches: number; statuses: Record<string, number> }>();
  for (const e of events) {
    const u = perUser.get(e.searchedUsername) ?? { username: e.searchedUsername, searches: 0, statuses: {} };
    u.searches += 1;
    u.statuses[e.status] = (u.statuses[e.status] ?? 0) + 1;
    perUser.set(e.searchedUsername, u);
  }

  return {
    date,
    totalSearches: events.length,
    successfulSearches: events.filter((e) => e.status === "SUCCESS").length,
    profilesChecked: perUser.size,
    activityEvents: activity,
    profiles: [...perUser.values()].sort((a, b) => b.searches - a.searches),
    snapshots: snapshots.map((s) => ({
      id: s.id,
      username: s.profile.username,
      displayName: s.profile.displayName,
      followersCount: s.followersCount,
      followingCount: s.followingCount,
      mediaCount: s.mediaCount,
      reelCount: s.reelCount,
      trigger: s.trigger,
      capturedAt: s.capturedAt.toISOString(),
    })),
  };
}

export async function getProfileHistory(username: string, tz: string, range?: { from: string; to: string }) {
  const profile = await getStoredProfile(username);
  const time = range ? (() => { const r = zonedRange(range.from, range.to, tz); return { gte: r.start, lt: r.end }; })() : undefined;
  const [snapshots, searches] = await Promise.all([
    prisma.profileSnapshot.findMany({
      where: { profileId: profile.id, ...(time ? { capturedAt: time } : {}) },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.searchEvent.findMany({
      where: { profileId: profile.id, ...(time ? { searchedAt: time } : {}) },
      select: { searchedAt: true },
    }),
  ]);
  return {
    profile: serializeProfile(profile),
    rows: buildProfileHistory(snapshots, searches, tz),
    snapshots: snapshots
      .slice(-200)
      .reverse()
      .map((s) => ({
        id: s.id,
        followersCount: s.followersCount,
        followingCount: s.followingCount,
        mediaCount: s.mediaCount,
        reelCount: s.reelCount,
        accessibleMediaCount: s.accessibleMediaCount,
        trigger: s.trigger,
        capturedAt: s.capturedAt.toISOString(),
      })),
  };
}
