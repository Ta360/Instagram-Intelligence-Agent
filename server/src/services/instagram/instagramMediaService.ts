import type { MediaItem, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { isReel, type MediaType } from "./types.js";

export function serializeMedia(m: MediaItem) {
  const reel = isReel({ mediaType: m.mediaType as MediaType, productType: m.productType });
  return {
    id: m.id,
    mediaId: m.mediaId,
    mediaType: m.mediaType,
    productType: m.productType,
    isReel: reel,
    /** A video is playable in-app only when the authorized API returned a direct media URL. */
    playable: m.mediaType === "VIDEO" && Boolean(m.mediaUrl),
    thumbnailUrl: m.thumbnailUrl,
    mediaUrl: m.mediaUrl,
    permalink: m.permalink,
    caption: m.caption,
    likeCount: m.likeCount,
    commentsCount: m.commentsCount,
    publishedAt: m.publishedAt?.toISOString() ?? null,
  };
}
export type MediaDTO = ReturnType<typeof serializeMedia>;

export type MediaFilter = "all" | "posts" | "reels";

export async function listMedia(profileId: string, opts: { filter?: MediaFilter; page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 12, 1), 50);
  const page = Math.max(opts.page ?? 1, 1);
  const reelWhere: Prisma.MediaItemWhereInput = { OR: [{ productType: "REELS" }, { mediaType: "VIDEO" }] };
  const where: Prisma.MediaItemWhereInput = {
    profileId,
    ...(opts.filter === "reels" ? reelWhere : opts.filter === "posts" ? { NOT: reelWhere } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.mediaItem.count({ where }),
    prisma.mediaItem.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: rows.map(serializeMedia), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
