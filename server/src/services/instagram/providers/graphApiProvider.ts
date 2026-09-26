import { createHmac } from "node:crypto";
import { AppError } from "../../../lib/errors.js";
import { logger } from "../../../lib/logger.js";
import type { ParsedQuery } from "../../../lib/validation.js";
import type { CallBudget } from "../callBudget.js";
import {
  PROFILE_FIELDS,
  type ConnectionStatus,
  type FieldAvailability,
  type InstagramProvider,
  type MediaPage,
  type MediaType,
  type NormalizedMedia,
  type NormalizedProfile,
  type ProfileField,
  type ProviderResult,
} from "../types.js";

/**
 * PRODUCTION provider — Instagram Graph API via the official Business Discovery
 * endpoint (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery).
 *
 * What the official API allows:
 *  - Look up Instagram **Business and Creator** accounts by username, using your own
 *    authorized Business/Creator account (INSTAGRAM_BUSINESS_ACCOUNT_ID + access token).
 *  - Public profile fields: name, biography, website, profile picture, followers,
 *    follows, media count, and recent media (URLs, captions, like/comment counts).
 *
 * What it does NOT allow (surfaced as "unavailable" in the UI, never worked around):
 *  - Personal or private accounts, stories, followers lists, verified badge, account type,
 *    or looking up other accounts by numeric User ID.
 */
export interface GraphConfig {
  accessToken: string;
  businessAccountId: string;
  appSecret?: string;
  graphVersion: string;
  mediaLimit: number;
}

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
const PROFILE_FIELDS_GRAPH =
  "id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count";

const UNAVAILABLE = {
  isVerified: "Verified status is not exposed by the Instagram Graph API.",
  accountType: "Account type is not exposed by Business Discovery.",
} as const;

interface GraphMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}
interface GraphUser {
  id: string;
  username?: string;
  name?: string;
  biography?: string;
  website?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  media?: GraphMediaEdge;
}
interface GraphMediaEdge {
  data?: GraphMedia[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/** Graph cursors are base64url-like; validated because they are embedded in a field expansion. */
const CURSOR_RE = /^[A-Za-z0-9_\-=]{1,512}$/;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class GraphApiInstagramProvider implements InstagramProvider {
  readonly dataSource = "production" as const;
  readonly name = "Instagram Graph API — Business Discovery";

  constructor(
    private cfg: GraphConfig,
    private budget: CallBudget,
    private fetchImpl: FetchLike = fetch,
  ) {}

  private appSecretProof(): string | undefined {
    if (!this.cfg.appSecret) return undefined;
    return createHmac("sha256", this.cfg.appSecret).update(this.cfg.accessToken).digest("hex");
  }

  /** Performs one Graph API GET, enforcing the local call budget and mapping errors. */
  async graphGet<T>(path: string, fields: string): Promise<T> {
    this.budget.consume();
    const url = new URL(`https://graph.facebook.com/${this.cfg.graphVersion}/${path}`);
    url.searchParams.set("fields", fields);
    const proof = this.appSecretProof();
    if (proof) url.searchParams.set("appsecret_proof", proof);

    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        // Token travels in the Authorization header, keeping it out of URLs and logs.
        headers: { Authorization: `Bearer ${this.cfg.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (err) {
      logger.warn("instagram.network_error", { error: String((err as Error)?.message ?? err) });
      throw new AppError("NETWORK_ERROR", undefined, { cause: err });
    }

    this.captureUsage(res.headers);
    const body = (await res.json().catch(() => null)) as { error?: GraphError } & T;
    if (!res.ok || body?.error) throw this.mapError(res.status, body?.error);
    return body;
  }

  private captureUsage(headers: Headers) {
    const usage: Record<string, unknown> = {};
    for (const h of ["x-app-usage", "x-business-use-case-usage"]) {
      const v = headers.get(h);
      if (v) {
        try {
          usage[h] = JSON.parse(v);
        } catch {
          /* ignore malformed header */
        }
      }
    }
    if (Object.keys(usage).length) this.budget.metaUsage = usage;
  }

  mapError(httpStatus: number, err?: GraphError): AppError {
    const code = err?.code;
    const sub = err?.error_subcode;
    // Log code numbers only — upstream messages can echo request details.
    logger.warn("instagram.api_error", { httpStatus, code, subcode: sub, type: err?.type });

    if (code === 4 || code === 17 || code === 32 || code === 613 || (code && code >= 80001 && code <= 80014)) {
      this.budget.engageCooldown(15 * 60);
      return new AppError("RATE_LIMITED", undefined, { retryAfterSeconds: 900 });
    }
    if ((code === 110 && sub === 2207013) || (code === 100 && sub === 33) || code === 24 || httpStatus === 404) {
      return new AppError(
        "NOT_FOUND",
        "Instagram profile could not be found or is unavailable through the configured API. Only Business and Creator accounts can be looked up; personal and private accounts are not accessible.",
      );
    }
    if (code === 190) {
      return new AppError(
        "PERMISSION_REQUIRED",
        "The Instagram access token is invalid or expired. Generate a new long-lived token in Meta for Developers.",
      );
    }
    if (code === 10 || (code && code >= 200 && code <= 299) || httpStatus === 403) {
      return new AppError("PERMISSION_REQUIRED");
    }
    if (httpStatus >= 500) return new AppError("NETWORK_ERROR");
    return new AppError("NETWORK_ERROR", "The Instagram API returned an unexpected response.");
  }

  async fetchProfile(query: ParsedQuery): Promise<ProviderResult> {
    const mediaExpansion = `media.limit(${this.cfg.mediaLimit}){${MEDIA_FIELDS}}`;

    if (query.kind === "userId") {
      // Graph API only permits reading other accounts via Business Discovery (by username).
      if (query.value !== this.cfg.businessAccountId) {
        throw new AppError(
          "PERMISSION_REQUIRED",
          "Lookup by numeric Instagram User ID is only available for your own authorized account. Search by username instead.",
        );
      }
      const own = await this.graphGet<GraphUser>(query.value, `${PROFILE_FIELDS_GRAPH},${mediaExpansion}`);
      return this.normalize(own);
    }

    // Username has already been validated against /^[a-z0-9._]{1,30}$/ so it is safe inside the field expansion.
    const fields = `business_discovery.username(${query.value}){${PROFILE_FIELDS_GRAPH},${mediaExpansion}}`;
    const body = await this.graphGet<{ business_discovery?: GraphUser }>(this.cfg.businessAccountId, fields);
    if (!body.business_discovery) throw new AppError("NOT_FOUND");
    return this.normalize(body.business_discovery);
  }

  /** Next page of media via official cursor pagination — one API call per page. */
  async fetchMoreMedia(query: ParsedQuery, cursor: string): Promise<MediaPage> {
    if (!CURSOR_RE.test(cursor)) throw new AppError("INVALID_INPUT", "Invalid media cursor.");
    const edge = `media.after(${cursor}).limit(${this.cfg.mediaLimit}){${MEDIA_FIELDS}}`;
    let user: GraphUser | undefined;
    if (query.kind === "userId") {
      if (query.value !== this.cfg.businessAccountId) throw new AppError("PERMISSION_REQUIRED");
      user = await this.graphGet<GraphUser>(query.value, edge);
    } else {
      const body = await this.graphGet<{ business_discovery?: GraphUser }>(
        this.cfg.businessAccountId,
        `business_discovery.username(${query.value}){${edge}}`,
      );
      user = body.business_discovery;
    }
    if (!user) throw new AppError("NOT_FOUND");
    return { media: this.normalizeMedia(user.media), mediaCursor: nextCursor(user.media, this.cfg.mediaLimit) };
  }

  normalize(u: GraphUser): ProviderResult {
    const username = (u.username ?? "").toLowerCase();
    const has = (v: unknown) => v !== undefined && v !== null && v !== "";

    const values: Omit<NormalizedProfile, "fieldAvailability" | "unavailableReasons"> = {
      igUserId: u.id ?? null,
      username,
      displayName: u.name ?? null,
      bio: u.biography ?? null,
      profilePictureUrl: u.profile_picture_url ?? null,
      website: u.website ?? null,
      accountType: null,
      followersCount: u.followers_count ?? null,
      followingCount: u.follows_count ?? null,
      mediaCount: u.media_count ?? null,
      isVerified: null,
      profileUrl: username ? `https://www.instagram.com/${username}/` : null,
    };

    const availability = {} as Record<ProfileField, FieldAvailability>;
    const reasons: NormalizedProfile["unavailableReasons"] = {};
    for (const f of PROFILE_FIELDS) {
      if (f === "username" || f === "profileUrl") availability[f] = "public";
      else if (f === "isVerified" || f === "accountType") {
        availability[f] = "unavailable";
        reasons[f] = UNAVAILABLE[f];
      } else if (has(values[f])) availability[f] = "authorized_api";
      else {
        availability[f] = "unavailable";
        reasons[f] = "Not returned by the Instagram API for this account.";
      }
    }

    return {
      profile: { ...values, fieldAvailability: availability, unavailableReasons: reasons },
      media: this.normalizeMedia(u.media),
      mediaCursor: nextCursor(u.media, this.cfg.mediaLimit),
    };
  }

  normalizeMedia(edge?: GraphMediaEdge): NormalizedMedia[] {
    return (edge?.data ?? []).map((m) => {
      const type = (["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(m.media_type ?? "")
        ? m.media_type
        : "IMAGE") as MediaType;
      return {
        mediaId: m.id,
        mediaType: type,
        productType: m.media_product_type ?? null,
        thumbnailUrl: type === "VIDEO" ? (m.thumbnail_url ?? null) : (m.media_url ?? m.thumbnail_url ?? null),
        mediaUrl: m.media_url ?? null,
        permalink: m.permalink ?? null,
        caption: m.caption ?? null,
        likeCount: typeof m.like_count === "number" ? m.like_count : null,
        commentsCount: typeof m.comments_count === "number" ? m.comments_count : null,
        publishedAt: m.timestamp ? new Date(m.timestamp) : null,
      };
    });
  }

  async checkConnection(): Promise<ConnectionStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const me = await this.graphGet<{ id: string; username?: string }>(this.cfg.businessAccountId, "id,username");
      return {
        ok: true,
        message: "Connected to the Instagram Graph API.",
        account: { id: me.id, username: me.username ?? null },
        checkedAt,
      };
    } catch (err) {
      const msg = err instanceof AppError ? err.userMessage : "Unable to connect to the Instagram API.";
      return { ok: false, message: msg, checkedAt };
    }
  }
}

/**
 * Business Discovery's media edge returns only before/after cursors — no `next`
 * link — when more pages exist. An `after` cursor on a full page means "maybe
 * more"; a short or empty page means we've reached the end.
 */
function nextCursor(edge: GraphMediaEdge | undefined, pageSize: number): string | null {
  const after = edge?.paging?.cursors?.after;
  if (!after || !CURSOR_RE.test(after)) return null;
  if (edge?.paging?.next) return after;
  return (edge?.data?.length ?? 0) >= pageSize ? after : null;
}

interface GraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

/** Placeholder used when production mode is selected but credentials are missing. */
export class UnconfiguredInstagramProvider implements InstagramProvider {
  readonly dataSource = "production" as const;
  readonly name = "Instagram Graph API (not configured)";
  async fetchProfile(): Promise<ProviderResult> {
    throw new AppError("API_NOT_CONFIGURED");
  }
  async fetchMoreMedia(): Promise<MediaPage> {
    throw new AppError("API_NOT_CONFIGURED");
  }
  async checkConnection(): Promise<ConnectionStatus> {
    return {
      ok: false,
      message: "INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID are not configured.",
      checkedAt: new Date().toISOString(),
    };
  }
}
