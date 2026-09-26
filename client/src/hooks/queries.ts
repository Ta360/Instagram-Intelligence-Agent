import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type RangeQuery } from "@/lib/api";
import type { DailyMetric, SearchStatus } from "@/lib/types";

/** Queries that depend on searches/snapshots — invalidated after every search or refresh. */
export const ANALYTICS_KEYS = ["summary", "daily", "distribution", "calendar", "date", "history", "profileHistory", "activity", "recent", "profiles", "saved", "media"];

export const useSystemStatus = () => useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 60_000, staleTime: 30_000 });
export const useSummary = () => useQuery({ queryKey: ["summary"], queryFn: api.summary });

export const useDaily = (q: RangeQuery & { metric: DailyMetric; username?: string }, enabled = true) =>
  useQuery({ queryKey: ["daily", q], queryFn: () => api.daily(q), enabled, placeholderData: keepPreviousData });

export const useDistribution = (q: RangeQuery) =>
  useQuery({ queryKey: ["distribution", q], queryFn: () => api.distribution(q), placeholderData: keepPreviousData });

export const useCalendar = (month: string) =>
  useQuery({ queryKey: ["calendar", month], queryFn: () => api.calendar(month), placeholderData: keepPreviousData });

export const useDateAnalytics = (date: string | null) =>
  useQuery({ queryKey: ["date", date], queryFn: () => api.dateAnalytics(date!), enabled: Boolean(date) });

export const useProfile = (username: string | null) =>
  useQuery({ queryKey: ["profile", username], queryFn: () => api.profile(username!), enabled: Boolean(username), retry: false });

export const useProfileHistory = (username: string | null, range?: RangeQuery) =>
  useQuery({ queryKey: ["profileHistory", username, range], queryFn: () => api.profileHistory(username!, range), enabled: Boolean(username) });

export const useMedia = (username: string | null, type: "all" | "posts" | "reels", page = 1, pageSize = 12) =>
  useQuery({
    queryKey: ["media", username, type, page, pageSize],
    queryFn: () => api.media(username!, { type, page, pageSize }),
    enabled: Boolean(username),
    placeholderData: keepPreviousData,
  });

export const useSearchHistory = (q: { page: number; pageSize: number; username?: string; status?: SearchStatus | ""; from?: string; to?: string }) =>
  useQuery({ queryKey: ["history", q], queryFn: () => api.searchHistory(q), placeholderData: keepPreviousData });

export const useSaved = () => useQuery({ queryKey: ["saved"], queryFn: api.saved });
export const useProfiles = () => useQuery({ queryKey: ["profiles"], queryFn: api.profiles });

export const useActivity = (username?: string, limit = 20) =>
  useQuery({ queryKey: ["activity", username ?? null, limit], queryFn: () => api.activity({ username, limit }) });

export const useRecentSearches = (q: string) =>
  useQuery({ queryKey: ["recent", q], queryFn: () => api.recentSearches(q), staleTime: 10_000, placeholderData: keepPreviousData });
