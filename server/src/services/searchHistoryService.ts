import type { Prisma, SearchStatus } from "@prisma/client";
import { toCsv } from "../lib/csv.js";
import { zonedRange } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { getInstagramProvider } from "./instagram/instagramClient.js";

export const SEARCH_STATUSES: SearchStatus[] = [
  "SUCCESS",
  "NOT_FOUND",
  "PRIVATE",
  "PERMISSION_REQUIRED",
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "INVALID_INPUT",
];

export interface HistoryFilters {
  username?: string;
  status?: SearchStatus;
  from?: string;
  to?: string;
  tz: string;
}

function buildWhere(f: HistoryFilters): Prisma.SearchEventWhereInput {
  const where: Prisma.SearchEventWhereInput = { dataSource: getInstagramProvider().dataSource };
  if (f.username) where.searchedUsername = { contains: f.username.replace(/^@/, "").toLowerCase() };
  if (f.status) where.status = f.status;
  if (f.from && f.to) {
    const { start, end } = zonedRange(f.from, f.to, f.tz);
    where.searchedAt = { gte: start, lt: end };
  }
  return where;
}

function serialize(e: Prisma.SearchEventGetPayload<object>) {
  return {
    id: e.id,
    username: e.searchedUsername,
    profileName: e.profileName,
    searchedAt: e.searchedAt.toISOString(),
    followersSnapshot: e.followersSnapshot,
    followingSnapshot: e.followingSnapshot,
    mediaCount: e.mediaCountSnapshot,
    accessibleMediaCount: e.accessibleMediaCount,
    accessibleReelCount: e.accessibleReelCount,
    status: e.status,
    profileId: e.profileId,
  };
}

export async function listSearchHistory(f: HistoryFilters & { page?: number; pageSize?: number }) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const where = buildWhere(f);
  const [total, rows] = await Promise.all([
    prisma.searchEvent.count({ where }),
    prisma.searchEvent.findMany({ where, orderBy: { searchedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items: rows.map(serialize), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function exportSearchHistoryCsv(f: HistoryFilters): Promise<string> {
  const rows = await prisma.searchEvent.findMany({ where: buildWhere(f), orderBy: { searchedAt: "desc" }, take: 10_000 });
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: f.tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: f.tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return toCsv(
    ["Username", "Profile Name", "Search Date", "Search Time", "Followers Snapshot", "Following Snapshot", "Media Count", "Accessible Media", "Accessible Reels", "Search Status", "Data Source"],
    rows.map((r) => [
      `@${r.searchedUsername}`,
      r.profileName,
      dateFmt.format(r.searchedAt),
      timeFmt.format(r.searchedAt),
      r.followersSnapshot,
      r.followingSnapshot,
      r.mediaCountSnapshot,
      r.accessibleMediaCount,
      r.accessibleReelCount,
      r.status,
      r.dataSource === "mock" ? "DEMO DATA" : "Instagram API",
    ]),
  );
}

/** Usernames previously searched (for search-bar suggestions). */
export async function recentSearches(prefix: string | undefined, limit = 8) {
  const rows = await prisma.searchEvent.findMany({
    where: {
      dataSource: getInstagramProvider().dataSource,
      status: "SUCCESS",
      ...(prefix ? { searchedUsername: { startsWith: prefix.replace(/^@/, "").toLowerCase() } } : {}),
    },
    orderBy: { searchedAt: "desc" },
    distinct: ["searchedUsername"],
    take: Math.min(limit, 20),
    select: { searchedUsername: true, profileName: true, searchedAt: true },
  });
  return rows.map((r) => ({ username: r.searchedUsername, profileName: r.profileName, searchedAt: r.searchedAt.toISOString() }));
}
