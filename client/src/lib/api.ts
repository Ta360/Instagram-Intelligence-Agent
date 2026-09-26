import type {
  ActivityItem,
  AuthStatus,
  AuthUser,
  AssistantReply,
  CalendarDay,
  ChartColors,
  DailyMetric,
  DailySeries,
  DateAnalytics,
  Distribution,
  Media,
  Paged,
  Profile,
  ProfileHistory,
  RefreshResult,
  SavedItem,
  SearchEventRow,
  SearchResult,
  SearchStatus,
  SnapshotRow,
  Summary,
  SystemStatus,
} from "./types";
import { browserTimeZone } from "./dates";

/** Error carrying the sanitized code/message returned by the server. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined | null>;

function qs(q: Query = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ tz: browserTimeZone(), ...q })) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function request<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const { query, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs(query)}`, {
      credentials: "include",
      ...rest,
      headers: { Accept: "application/json", ...(rest.body ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Unable to reach the Instagram Intelligence Agent server.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error;
    // A 401 on a dashboard route means the session ended: let the app show the sign-in screen.
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("iia:unauthorized"));
    throw new ApiError(e?.code ?? "INTERNAL", e?.message ?? "Something went wrong.", res.status, e?.retryAfterSeconds);
  }
  return body as T;
}

const json = (body: unknown) => JSON.stringify(body);
export type RangeQuery = { range?: string; from?: string; to?: string };

export const api = {
  // auth
  authStatus: () => request<AuthStatus>("/auth/status"),
  signup: (b: { name: string; email: string; password: string }) =>
    request<{ authenticated: boolean; user: AuthUser }>("/auth/signup", { method: "POST", body: json(b) }),
  login: (b: { email: string; password: string; remember: boolean }) =>
    request<{ authenticated: boolean; user: AuthUser }>("/auth/login", { method: "POST", body: json(b) }),
  logout: () => request<{ authenticated: boolean }>("/auth/logout", { method: "POST" }),
  logoutAll: () => request<{ authenticated: boolean }>("/auth/logout-all", { method: "POST" }),
  changePassword: (b: { currentPassword: string; newPassword: string }) =>
    request<{ changed: boolean }>("/auth/change-password", { method: "POST", body: json(b) }),

  // search & profiles
  search: (query: string) => request<SearchResult>("/search", { method: "POST", body: json({ query }) }),
  profiles: () => request<{ items: Profile[] }>("/instagram/profiles"),
  profile: (u: string) => request<{ dataSource: string; profile: Profile }>(`/instagram/profile/${encodeURIComponent(u)}`),
  snapshot: (u: string) =>
    request<{ profile: Profile; snapshot: SnapshotRow | null }>(`/instagram/profile/${encodeURIComponent(u)}/snapshot`),
  profileHistory: (u: string, r?: RangeQuery) =>
    request<ProfileHistory>(`/instagram/profile/${encodeURIComponent(u)}/history`, { query: r }),
  media: (u: string, q: { type?: "all" | "posts" | "reels"; page?: number; pageSize?: number } = {}) =>
    request<Paged<Media>>(`/instagram/profile/${encodeURIComponent(u)}/media`, { query: q }),
  loadMoreMedia: (u: string) =>
    request<{ added: number; hasMoreMedia: boolean; totalStored: number }>(`/instagram/profile/${encodeURIComponent(u)}/media/more`, { method: "POST" }),
  refresh: (u: string, trigger: "live" | "manual") =>
    request<RefreshResult>(`/instagram/profile/${encodeURIComponent(u)}/refresh`, { method: "POST", body: json({ trigger }) }),

  // analytics
  summary: () => request<Summary>("/analytics/summary"),
  daily: (q: RangeQuery & { metric: DailyMetric; username?: string }) => request<DailySeries>("/analytics/daily", { query: q }),
  distribution: (q: RangeQuery) => request<Distribution>("/analytics/search-distribution", { query: q }),
  calendar: (month: string) => request<{ month: string; days: CalendarDay[] }>("/calendar", { query: { month } }),
  dateAnalytics: (date: string) => request<DateAnalytics>(`/analytics/date/${date}`),

  // history
  searchHistory: (q: { page?: number; pageSize?: number; username?: string; status?: SearchStatus | ""; from?: string; to?: string }) =>
    request<Paged<SearchEventRow>>("/search-history", { query: q }),
  recentSearches: (q?: string) =>
    request<{ items: { username: string; profileName: string | null; searchedAt: string }[] }>("/search-history/recent", { query: { q } }),
  exportCsvUrl: (q: { username?: string; status?: string; from?: string; to?: string }) => `/api/search-history/export.csv${qs(q)}`,

  // saved
  saved: () => request<{ items: SavedItem[] }>("/saved-profiles"),
  save: (username: string) => request<SavedItem>("/saved-profiles", { method: "POST", body: json({ username }) }),
  unsave: (id: string) => request<{ removed: boolean }>(`/saved-profiles/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // activity
  activity: (q: { limit?: number; username?: string } = {}) => request<{ items: ActivityItem[] }>("/activity", { query: q }),
  logActivity: (type: "view_profile" | "play_media" | "export_csv", username?: string, detail?: string) =>
    request<{ ok: boolean }>("/activity", { method: "POST", body: json({ type, username, detail }) }).catch(() => null),

  // settings
  chartColors: () => request<{ colors: ChartColors; defaults: ChartColors }>("/settings/chart-colors"),
  updateChartColors: (patch: Partial<ChartColors>) =>
    request<{ colors: ChartColors }>("/settings/chart-colors", { method: "PUT", body: json(patch) }),
  resetChartColors: () => request<{ colors: ChartColors }>("/settings/chart-colors/reset", { method: "POST" }),

  // assistant & system
  assistant: (message: string, history: { role: "user" | "assistant"; content: string }[]) =>
    request<AssistantReply>("/assistant/chat", { method: "POST", body: json({ message, history, tz: browserTimeZone() }) }),
  status: () => request<SystemStatus>("/system/status"),
};
