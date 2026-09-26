import type { InstagramProfile, SavedProfile, SnapshotTrigger } from "@prisma/client";
import { env } from "../../config/env.js";
import { AppError, toSearchStatus } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { TtlCache } from "../../lib/ttlCache.js";
import { parseInstagramQuery, type ParsedQuery } from "../../lib/validation.js";
import { logActivity } from "../activityService.js";
import { getInstagramProvider } from "./instagramClient.js";
import { serializeMedia } from "./instagramMediaService.js";
import { isReel, type NormalizedMedia, type NormalizedProfile, type ProviderResult } from "./types.js";

const cache = new TtlCache<ProviderResult>(env.instagram.cacheTtlSeconds * 1000);
export const clearProfileCache = () => cache.clear();

type ProfileRow = InstagramProfile & { saved?: SavedProfile | null };

export function serializeProfile(p: ProfileRow) {
  const fa = (p.fieldAvailability ?? {}) as { fields?: Record<string, string>; reasons?: Record<string, string> };
  return {
    id: p.id,
    dataSource: p.dataSource,
    igUserId: p.igUserId,
    username: p.username,
    displayName: p.displayName,
    bio: p.bio,
    profilePictureUrl: p.profilePictureUrl,
    website: p.website,
    accountType: p.accountType,
    followersCount: p.followersCount,
    followingCount: p.followingCount,
    mediaCount: p.mediaCount,
    isVerified: p.isVerified,
    profileUrl: p.profileUrl,
    fieldAvailability: fa.fields ?? {},
    unavailableReasons: fa.reasons ?? {},
    lastCheckedAt: p.lastCheckedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    /** More media pages are available from the API (cursor itself stays server-side). */
    hasMoreMedia: Boolean(p.mediaCursor),
    savedId: p.saved?.id ?? null,
  };
}
export type ProfileDTO = ReturnType<typeof serializeProfile>;

function profileData(p: NormalizedProfile) {
  return {
    igUserId: p.igUserId,
    displayName: p.displayName,
    bio: p.bio,
    profilePictureUrl: p.profilePictureUrl,
    website: p.website,
    accountType: p.accountType,
    followersCount: p.followersCount,
    followingCount: p.followingCount,
    mediaCount: p.mediaCount,
    isVerified: p.isVerified,
    profileUrl: p.profileUrl,
    fieldAvailability: { fields: p.fieldAvailability, reasons: p.unavailableReasons },
    lastCheckedAt: new Date(),
  };
}

async function fetchWithCache(query: ParsedQuery, bypassCache: boolean) {
  const provider = getInstagramProvider();
  const key = `${provider.dataSource}:${query.kind}:${query.value}`;
  if (!bypassCache) {
    const hit = cache.get(key);
    if (hit) return { result: hit.value, fromCache: true, fetchedAt: new Date(hit.storedAt) };
  }
  const result = await provider.fetchProfile(query);
  cache.set(key, result);
  return { result, fromCache: false, fetchedAt: new Date() };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function upsertMedia(tx: Tx, profileId: string, media: NormalizedMedia[]) {
  for (const m of media) {
    const data = {
      mediaType: m.mediaType,
      productType: m.productType,
      thumbnailUrl: m.thumbnailUrl,
      mediaUrl: m.mediaUrl,
      permalink: m.permalink,
      caption: m.caption,
      likeCount: m.likeCount,
      commentsCount: m.commentsCount,
      publishedAt: m.publishedAt,
    };
    await tx.mediaItem.upsert({
      where: { profileId_mediaId: { profileId, mediaId: m.mediaId } },
      create: { profileId, mediaId: m.mediaId, ...data },
      update: data,
    });
  }
}

/**
 * Loads the next page of the profile's media through the official API's cursor
 * pagination (one API call, subject to the call budget) and stores it.
 */
export async function loadMoreMedia(username: string) {
  const profile = await getStoredProfile(username);
  if (!profile.mediaCursor) {
    return { added: 0, hasMoreMedia: false, totalStored: await prisma.mediaItem.count({ where: { profileId: profile.id } }) };
  }
  const query = { kind: "username" as const, value: profile.username, raw: profile.username };
  const page = await getInstagramProvider().fetchMoreMedia(query, profile.mediaCursor);
  const before = await prisma.mediaItem.count({ where: { profileId: profile.id } });
  await prisma.$transaction(async (tx) => {
    await upsertMedia(tx, profile.id, page.media);
    await tx.instagramProfile.update({ where: { id: profile.id }, data: { mediaCursor: page.mediaCursor } });
  });
  const totalStored = await prisma.mediaItem.count({ where: { profileId: profile.id } });
  return { added: totalStored - before, hasMoreMedia: Boolean(page.mediaCursor), totalStored };
}

/** Upserts profile + media and appends a snapshot; returns the stored rows. */
async function persistResult(result: ProviderResult, trigger: SnapshotTrigger, writeSnapshot: boolean) {
  const dataSource = getInstagramProvider().dataSource;
  const p = result.profile;
  const reelCount = result.media.filter(isReel).length;

  return prisma.$transaction(async (tx) => {
    const data = { ...profileData(p), mediaCursor: result.mediaCursor };
    const profile = await tx.instagramProfile.upsert({
      where: { dataSource_username: { dataSource, username: p.username } },
      create: { dataSource, username: p.username, ...data },
      update: data,
      include: { saved: true },
    });

    await upsertMedia(tx, profile.id, result.media);

    const snapshot = writeSnapshot
      ? await tx.profileSnapshot.create({
          data: {
            profileId: profile.id,
            dataSource,
            followersCount: p.followersCount,
            followingCount: p.followingCount,
            mediaCount: p.mediaCount,
            reelCount,
            accessibleMediaCount: result.media.length,
            trigger,
          },
        })
      : null;

    return { profile, snapshot, reelCount };
  });
}

/**
 * Full search flow: validate → call the configured provider → store profile,
 * media, a historical snapshot and a search event → return everything the UI needs.
 * Failed lookups are recorded as search events with their status too.
 */
export async function searchProfile(rawQuery: unknown) {
  const parsed = parseInstagramQuery(rawQuery);
  if (!parsed.ok) throw new AppError("INVALID_INPUT", parsed.error);
  const query = parsed.query;
  const dataSource = getInstagramProvider().dataSource;

  try {
    const { result, fromCache, fetchedAt } = await fetchWithCache(query, false);
    // A cached response carries no new information, so it does not create a duplicate snapshot.
    const { profile, snapshot, reelCount } = await persistResult(result, "SEARCH", !fromCache);

    const event = await prisma.searchEvent.create({
      data: {
        dataSource,
        profileId: profile.id,
        searchedUsername: profile.username,
        profileName: profile.displayName,
        followersSnapshot: profile.followersCount,
        followingSnapshot: profile.followingCount,
        mediaCountSnapshot: profile.mediaCount,
        accessibleMediaCount: result.media.length,
        accessibleReelCount: reelCount,
        status: "SUCCESS",
      },
    });
    await logActivity(dataSource, "search", { username: profile.username, profileId: profile.id });

    const media = await prisma.mediaItem.findMany({
      where: { profileId: profile.id, mediaId: { in: result.media.map((m) => m.mediaId) } },
      orderBy: { publishedAt: "desc" },
    });

    return {
      dataSource,
      profile: serializeProfile(profile),
      media: media.map(serializeMedia),
      searchEventId: event.id,
      snapshotCreated: Boolean(snapshot),
      fromCache,
      fetchedAt: fetchedAt.toISOString(),
    };
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error("search.unexpected_error", { error: String((err as Error)?.stack ?? err).slice(0, 2000) });
    }
    const appErr = err instanceof AppError ? err : new AppError("INTERNAL", undefined, { cause: err });
    const username = query.kind === "username" ? query.value : `id:${query.value}`;
    const existing = await prisma.instagramProfile.findUnique({
      where: { dataSource_username: { dataSource, username } },
    });
    await prisma.searchEvent.create({
      data: {
        dataSource,
        profileId: existing?.id ?? null,
        searchedUsername: username,
        status: toSearchStatus(appErr.code),
      },
    });
    await logActivity(dataSource, "search_failed", { username, detail: appErr.code });
    throw appErr;
  }
}

/**
 * Live / manual refresh. Bypasses the cache but enforces a minimum interval per
 * profile (production mode) so live tracking stays within Instagram's rate limits.
 */
export async function refreshProfile(username: string, trigger: "live" | "manual") {
  const parsed = parseInstagramQuery(username);
  if (!parsed.ok || parsed.query.kind !== "username") throw new AppError("INVALID_INPUT", "Invalid username.");
  const provider = getInstagramProvider();
  const dataSource = provider.dataSource;

  const existing = await prisma.instagramProfile.findUnique({
    where: { dataSource_username: { dataSource, username: parsed.query.value } },
    include: { saved: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Search for this profile before enabling tracking.");

  const minMs = dataSource === "production" ? env.instagram.minRefreshIntervalMinutes * 60_000 : 60_000;
  const last = await prisma.profileSnapshot.findFirst({
    where: { profileId: existing.id },
    orderBy: { capturedAt: "desc" },
  });
  const nextAllowed = last ? last.capturedAt.getTime() + minMs : 0;
  if (Date.now() < nextAllowed) {
    return {
      refreshed: false,
      reason: "Refreshed recently — waiting for the minimum interval to respect API limits.",
      nextAllowedAt: new Date(nextAllowed).toISOString(),
      profile: serializeProfile(existing),
    };
  }

  const { result } = await fetchWithCache(parsed.query, true);
  const { profile, snapshot } = await persistResult(result, trigger === "live" ? "LIVE_REFRESH" : "MANUAL_REFRESH", true);
  await logActivity(dataSource, trigger === "live" ? "live_refresh" : "manual_refresh", {
    username: profile.username,
    profileId: profile.id,
  });
  return {
    refreshed: true,
    snapshotId: snapshot?.id ?? null,
    nextAllowedAt: new Date(Date.now() + minMs).toISOString(),
    profile: serializeProfile(profile),
  };
}

export async function getStoredProfile(username: string) {
  const parsed = parseInstagramQuery(username);
  if (!parsed.ok) throw new AppError("INVALID_INPUT", parsed.error);
  const dataSource = getInstagramProvider().dataSource;
  const profile =
    parsed.query.kind === "userId"
      ? await prisma.instagramProfile.findFirst({
          where: { dataSource, igUserId: parsed.query.value },
          include: { saved: true },
        })
      : await prisma.instagramProfile.findUnique({
          where: { dataSource_username: { dataSource, username: parsed.query.value } },
          include: { saved: true },
        });
  if (!profile) {
    throw new AppError("NOT_FOUND", "This profile has not been searched yet. Search for it to load its data.");
  }
  return profile;
}

export async function getLatestSnapshot(username: string) {
  const profile = await getStoredProfile(username);
  const snap = await prisma.profileSnapshot.findFirst({
    where: { profileId: profile.id },
    orderBy: { capturedAt: "desc" },
  });
  return {
    profile: serializeProfile(profile),
    snapshot: snap
      ? {
          followersCount: snap.followersCount,
          followingCount: snap.followingCount,
          mediaCount: snap.mediaCount,
          reelCount: snap.reelCount,
          accessibleMediaCount: snap.accessibleMediaCount,
          capturedAt: snap.capturedAt.toISOString(),
          trigger: snap.trigger,
        }
      : null,
  };
}

export async function listProfiles(limit = 50) {
  const dataSource = getInstagramProvider().dataSource;
  const rows = await prisma.instagramProfile.findMany({
    where: { dataSource },
    orderBy: { lastCheckedAt: "desc" },
    take: Math.min(limit, 200),
    include: { saved: true },
  });
  return rows.map(serializeProfile);
}
