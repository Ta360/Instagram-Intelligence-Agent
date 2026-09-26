import type { DataSource } from "@prisma/client";
import type { ParsedQuery } from "../../lib/validation.js";

/**
 * Where a field's value came from:
 *  - public          → publicly accessible (e.g. the profile URL / username)
 *  - authorized_api  → returned by the authorized Instagram/Meta API
 *  - unavailable     → not provided by the API, restricted, or missing permissions
 *  - demo            → mock mode sample data (never real)
 */
export type FieldAvailability = "public" | "authorized_api" | "unavailable" | "demo";

export const PROFILE_FIELDS = [
  "username",
  "displayName",
  "bio",
  "profilePictureUrl",
  "website",
  "accountType",
  "followersCount",
  "followingCount",
  "mediaCount",
  "isVerified",
  "profileUrl",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export interface NormalizedProfile {
  igUserId: string | null;
  username: string;
  displayName: string | null;
  bio: string | null;
  profilePictureUrl: string | null;
  website: string | null;
  accountType: string | null;
  followersCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  isVerified: boolean | null;
  profileUrl: string | null;
  fieldAvailability: Record<ProfileField, FieldAvailability>;
  /** Human-readable reasons for unavailable fields, keyed by field. */
  unavailableReasons: Partial<Record<ProfileField, string>>;
}

export type MediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export interface NormalizedMedia {
  mediaId: string;
  mediaType: MediaType;
  productType: string | null;
  thumbnailUrl: string | null;
  /** Direct media URL returned by the API; null when the API withholds it. */
  mediaUrl: string | null;
  permalink: string | null;
  caption: string | null;
  likeCount: number | null;
  commentsCount: number | null;
  publishedAt: Date | null;
}

export interface ProviderResult {
  profile: NormalizedProfile;
  media: NormalizedMedia[];
  /** Opaque cursor for the next media page; null when all accessible media was returned. */
  mediaCursor: string | null;
}

export interface MediaPage {
  media: NormalizedMedia[];
  mediaCursor: string | null;
}

export interface ConnectionStatus {
  ok: boolean;
  message: string;
  account?: { id: string; username: string | null };
  checkedAt: string;
}

export interface InstagramProvider {
  readonly dataSource: DataSource;
  readonly name: string;
  fetchProfile(query: ParsedQuery): Promise<ProviderResult>;
  /** Next page of the account's media (official API pagination). */
  fetchMoreMedia(query: ParsedQuery, cursor: string): Promise<MediaPage>;
  checkConnection(): Promise<ConnectionStatus>;
}

export function isReel(m: Pick<NormalizedMedia, "mediaType" | "productType">): boolean {
  return m.productType === "REELS" || m.mediaType === "VIDEO";
}
