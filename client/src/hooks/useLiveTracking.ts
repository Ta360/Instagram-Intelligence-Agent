import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { ANALYTICS_KEYS, useSystemStatus } from "./queries";

/**
 * Live tracking: periodically refreshes one profile at a user-chosen interval.
 * Only intervals the server allows (based on API limits) can be selected, the
 * server additionally enforces a minimum interval, and polling pauses while the
 * tab is hidden — so the Instagram API is never polled aggressively.
 */
export function useLiveTracking(username: string | null) {
  const qc = useQueryClient();
  const { data: status } = useSystemStatus();
  const allowed = status?.liveTracking.allowedIntervals ?? [0];

  const [enabled, setEnabled] = useState(false);
  const [chosenInterval, setIntervalMin] = useState<number | null>(null);
  // Until the user picks one, use the smallest automatic interval the server allows.
  const intervalMin = chosenInterval !== null && allowed.includes(chosenInterval) ? chosenInterval : (allowed.find((m) => m > 0) ?? 0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nextRefresh, setNextRefresh] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset when switching profiles.
  useEffect(() => {
    setEnabled(false);
    setLastUpdated(null);
    setNextRefresh(null);
    setMessage(null);
  }, [username]);

  const refresh = useCallback(
    async (trigger: "live" | "manual") => {
      if (!username) return;
      setBusy(true);
      try {
        const r = await api.refresh(username, trigger);
        qc.setQueryData(["profile", username], { dataSource: r.profile.dataSource, profile: r.profile });
        if (r.refreshed) {
          setLastUpdated(new Date());
          setMessage(null);
          await Promise.all(ANALYTICS_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
        } else {
          setMessage(r.reason ?? "Skipped to respect API limits.");
        }
        return r;
      } catch (e) {
        setMessage(e instanceof ApiError ? e.message : "Refresh failed.");
        if (e instanceof ApiError && e.code === "RATE_LIMITED") setEnabled(false);
      } finally {
        setBusy(false);
      }
    },
    [username, qc],
  );

  useEffect(() => {
    clearTimeout(timer.current);
    if (!enabled || !username || intervalMin <= 0) {
      setNextRefresh(null);
      return;
    }
    const schedule = (ms: number) => {
      const at = new Date(Date.now() + ms);
      setNextRefresh(at);
      timer.current = setTimeout(async () => {
        if (document.visibilityState === "hidden") return schedule(30_000);
        const r = await refresh("live");
        const serverNext = r?.nextAllowedAt ? new Date(r.nextAllowedAt).getTime() - Date.now() : 0;
        schedule(Math.max(intervalMin * 60_000, serverNext, 30_000));
      }, ms);
    };
    schedule(intervalMin * 60_000);
    return () => clearTimeout(timer.current);
  }, [enabled, intervalMin, username, refresh]);

  return { enabled, setEnabled, intervalMin, setIntervalMin, allowed, lastUpdated, nextRefresh, message, busy, refreshNow: () => refresh("manual") };
}
