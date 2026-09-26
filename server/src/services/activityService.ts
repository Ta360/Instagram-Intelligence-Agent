import type { DataSource } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export const ACTIVITY_TYPES = [
  "search",
  "search_failed",
  "view_profile",
  "play_media",
  "save_profile",
  "unsave_profile",
  "live_refresh",
  "manual_refresh",
  "export_csv",
  "assistant_query",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Activity types the browser may record directly (everything else is server-generated). */
export const CLIENT_ACTIVITY_TYPES: ActivityType[] = ["view_profile", "play_media", "export_csv"];

export async function logActivity(
  dataSource: DataSource,
  type: ActivityType,
  data: { username?: string | null; profileId?: string | null; detail?: string | null } = {},
) {
  try {
    return await prisma.activityEvent.create({
      data: {
        dataSource,
        type,
        username: data.username ?? null,
        profileId: data.profileId ?? null,
        detail: data.detail?.slice(0, 280) ?? null,
      },
    });
  } catch (err) {
    // Activity logging must never break the user's action.
    logger.warn("activity.log_failed", { type, error: String(err) });
    return null;
  }
}

export async function listActivity(dataSource: DataSource, opts: { limit?: number; username?: string } = {}) {
  const rows = await prisma.activityEvent.findMany({
    where: { dataSource, ...(opts.username ? { username: opts.username } : {}) },
    orderBy: { occurredAt: "desc" },
    take: Math.min(Math.max(opts.limit ?? 30, 1), 200),
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    username: r.username,
    detail: r.detail,
    occurredAt: r.occurredAt.toISOString(),
  }));
}
