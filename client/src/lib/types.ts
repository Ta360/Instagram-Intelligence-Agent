// Mirrors the server DTOs (server/src/services/**). The server is the source of truth.
export type DataSource = "mock" | "production";
export type FieldAvailability = "public" | "authorized_api" | "unavailable" | "demo";
export type SearchStatus =
  | "SUCCESS"
  | "NOT_FOUND"
  | "PRIVATE"
  | "PERMISSION_REQUIRED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "INVALID_INPUT";

export interface Profile {
  id: string;
  dataSource: DataSource;
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
  fieldAvailability: Record<string, FieldAvailability>;
  unavailableReasons: Record<string, string>;
  lastCheckedAt: string;
  createdAt: string;
  savedId: string | null;
  /** More media pages can be fetched from the Instagram API. */
  hasMoreMedia: boolean;
}

export interface Media {
  id: string;
  mediaId: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  productType: string | null;
  isReel: boolean;
  playable: boolean;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  caption: string | null;
  likeCount: number | null;
  commentsCount: number | null;
  publishedAt: string | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SearchResult {
  dataSource: DataSource;
  profile: Profile;
  media: Media[];
  searchEventId: string;
  snapshotCreated: boolean;
  fromCache: boolean;
  fetchedAt: string;
}

export interface Summary {
  dataSource: DataSource;
  totalSearches: number;
  profilesTracked: number;
  searchesToday: number;
  mediaAvailable: number;
  savedProfiles: number;
  lastSearch: { username: string; searchedAt: string; status: SearchStatus } | null;
}

export type DailyMetric = "searchCount" | "followers" | "following" | "mediaCount" | "reelCount" | "profileChecks";
export interface DayPoint {
  date: string;
  value: number | null;
}
export interface DailySeries {
  metric: DailyMetric;
  from: string;
  to: string;
  username: string | null;
  points: DayPoint[];
}

export interface DistributionSlice {
  username: string;
  count: number;
  percent: number;
}
export interface Distribution {
  from: string;
  to: string;
  total: number;
  slices: DistributionSlice[];
}

export interface CalendarDay {
  date: string;
  searches: number;
  profiles: number;
  usernames: string[];
}

export interface SnapshotRow {
  id: string;
  username?: string;
  displayName?: string | null;
  followersCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  reelCount: number | null;
  accessibleMediaCount?: number | null;
  trigger: "SEARCH" | "LIVE_REFRESH" | "MANUAL_REFRESH";
  capturedAt: string;
}

export interface DateAnalytics {
  date: string;
  totalSearches: number;
  successfulSearches: number;
  profilesChecked: number;
  activityEvents: number;
  profiles: { username: string; searches: number; statuses: Record<string, number> }[];
  snapshots: SnapshotRow[];
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
export interface ProfileHistory {
  profile: Profile;
  rows: HistoryRow[];
  snapshots: SnapshotRow[];
}

export interface SearchEventRow {
  id: string;
  username: string;
  profileName: string | null;
  searchedAt: string;
  followersSnapshot: number | null;
  followingSnapshot: number | null;
  mediaCount: number | null;
  accessibleMediaCount: number | null;
  accessibleReelCount: number | null;
  status: SearchStatus;
  profileId: string | null;
}

export interface SavedItem {
  id: string;
  savedAt: string;
  profile: Profile;
}

export interface ActivityItem {
  id: string;
  type: string;
  username: string | null;
  detail: string | null;
  occurredAt: string;
}

export type ChartColorKey = "primary" | "secondary" | "success" | "warning" | "danger" | "info" | "accent";
export type ChartColors = Record<ChartColorKey, string>;

export interface SystemStatus {
  appName: string;
  version: string;
  mode: DataSource;
  demoData: boolean;
  provider: string;
  connected: boolean;
  connection: { ok: boolean; message: string; checkedAt: string; account?: { id: string; username: string | null } };
  credentials: { accessToken: boolean; businessAccountId: boolean; appId: boolean; appSecret: boolean; graphVersion: string };
  database: { ok: boolean; message: string };
  ai: { provider: "openai" | "local"; model: string };
  rateBudget: { used: number; limit: number; windowMinutes: number; cooldownUntil: string | null; metaUsage: Record<string, unknown> | null };
  cache: { profileTtlSeconds: number };
  liveTracking: { allowedIntervals: number[]; minIntervalMinutes: number };
  auth: { required: boolean; signupOpenByConfig: boolean };
  capabilities: { feature: string; state: "supported" | "limited" | "unavailable"; note: string }[];
  serverTime: string;
}

export interface RefreshResult {
  refreshed: boolean;
  reason?: string;
  nextAllowedAt: string;
  snapshotId?: string | null;
  profile: Profile;
}

export type AssistantAction =
  | { type: "openProfile"; username: string }
  | { type: "openDate"; date: string }
  | { type: "openMonth"; month: string }
  | { type: "openHistory" }
  | { type: "openSaved" };

export interface AssistantReply {
  reply: string;
  engine: "openai" | "local";
  dataSource: DataSource;
  toolCalls: { name: string; args: Record<string, unknown>; ok: boolean; error?: string }[];
  actions: AssistantAction[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
}
export interface AuthStatus {
  authenticated: boolean;
  user: AuthUser | null;
  signupOpen: boolean;
}
