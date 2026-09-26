import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import type { SearchResult } from "@/lib/types";
import { validateInstagramQuery } from "@/lib/validation";
import { ANALYTICS_KEYS } from "./queries";

export type SearchStage = "idle" | "searching" | "profile" | "media" | "analytics" | "done" | "error";

export const STAGE_LABEL: Record<SearchStage, string> = {
  idle: "",
  searching: "Searching Instagram...",
  profile: "Fetching profile information...",
  media: "Loading available media...",
  analytics: "Updating analytics...",
  done: "Done",
  error: "",
};

interface AppState {
  selectedUsername: string | null;
  selectProfile: (u: string | null) => void;
  stage: SearchStage;
  lastQuery: string;
  lastResult: SearchResult | null;
  error: ApiError | null;
  runSearch: (query: string) => Promise<SearchResult | null>;
  clearSearch: () => void;
  assistantOpen: boolean;
  setAssistantOpen: (v: boolean) => void;
}

const Ctx = createContext<AppState | null>(null);
const SELECTED_KEY = "iia-selected-profile";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [selectedUsername, setSelected] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_KEY);
    } catch {
      return null;
    }
  });
  const [stage, setStage] = useState<SearchStage>("idle");
  const [lastQuery, setLastQuery] = useState("");
  const [lastResult, setLastResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const selectProfile = useCallback((u: string | null) => setSelected(u), []);
  useEffect(() => {
    try {
      if (selectedUsername) localStorage.setItem(SELECTED_KEY, selectedUsername);
      else localStorage.removeItem(SELECTED_KEY);
    } catch {
      /* ignore */
    }
  }, [selectedUsername]);

  const invalidateAnalytics = useCallback(
    () => Promise.all(ANALYTICS_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
    [qc],
  );

  /**
   * Real staged search: each stage label reflects the request actually in flight
   * (validate → POST /api/search → GET media → refetch analytics).
   */
  const runSearch = useCallback(
    async (query: string) => {
      setLastQuery(query);
      setError(null);
      setStage("searching");
      const v = validateInstagramQuery(query);
      if (!v.ok) {
        setError(new ApiError("INVALID_INPUT", v.error, 400));
        setStage("error");
        return null;
      }
      try {
        setStage("profile");
        const result = await api.search(v.value);
        const u = result.profile.username;
        qc.setQueryData(["profile", u], { dataSource: result.dataSource, profile: result.profile });
        setLastResult(result);
        setSelected(u);

        setStage("media");
        await qc.fetchQuery({ queryKey: ["media", u, "all", 1, 12], queryFn: () => api.media(u, { type: "all", page: 1, pageSize: 12 }) });

        setStage("analytics");
        await invalidateAnalytics();
        setStage("done");
        return result;
      } catch (e) {
        setError(e instanceof ApiError ? e : new ApiError("INTERNAL", "Something went wrong.", 500));
        setStage("error");
        void invalidateAnalytics(); // failed searches are recorded too
        return null;
      }
    },
    [qc, invalidateAnalytics],
  );

  const clearSearch = useCallback(() => {
    setStage("idle");
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ selectedUsername, selectProfile, stage, lastQuery, lastResult, error, runSearch, clearSearch, assistantOpen, setAssistantOpen }),
    [selectedUsername, selectProfile, stage, lastQuery, lastResult, error, runSearch, clearSearch, assistantOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppState must be used inside AppStateProvider");
  return c;
}

export const isBusy = (s: SearchStage) => s === "searching" || s === "profile" || s === "media" || s === "analytics";

/** Debounce a changing value. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
