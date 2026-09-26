import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ChartColorKey, ChartColors } from "@/lib/types";
import { HEX_RE } from "@/lib/validation";

/**
 * Centralized chart color configuration. Every chart, the calendar and legend
 * read colors from here — nothing hard-codes its own palette. Values are
 * persisted server-side (chart_settings table) and applied instantly on change.
 */
export const DEFAULT_CHART_COLORS: ChartColors = {
  primary: "#6366F1",
  secondary: "#8B5CF6",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#06B6D4",
  accent: "#EC4899",
};

export const CHART_COLOR_LABELS: Record<ChartColorKey, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  info: "Info",
};

interface Ctx {
  colors: ChartColors;
  setColor: (key: ChartColorKey, hex: string) => void;
  reset: () => Promise<void>;
  saving: boolean;
}
const ChartColorsContext = createContext<Ctx | null>(null);

export function ChartColorsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["chartColors"], queryFn: api.chartColors, staleTime: Infinity });
  const [local, setLocal] = useState<ChartColors>(DEFAULT_CHART_COLORS);
  const [saving, setSaving] = useState(false);
  const pending = useRef<Partial<ChartColors>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (data?.colors) setLocal(data.colors);
  }, [data]);

  const setColor = useCallback(
    (key: ChartColorKey, hex: string) => {
      setLocal((c) => ({ ...c, [key]: hex })); // instant chart update
      if (!HEX_RE.test(hex)) return; // only persist valid hex values
      pending.current[key] = hex.toUpperCase();
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const patch = pending.current;
        pending.current = {};
        setSaving(true);
        try {
          const r = await api.updateChartColors(patch);
          qc.setQueryData(["chartColors"], (old: { defaults: ChartColors } | undefined) => ({ defaults: old?.defaults ?? DEFAULT_CHART_COLORS, colors: r.colors }));
        } finally {
          setSaving(false);
        }
      }, 400);
    },
    [qc],
  );

  const reset = useCallback(async () => {
    const r = await api.resetChartColors();
    setLocal(r.colors);
    qc.setQueryData(["chartColors"], { colors: r.colors, defaults: DEFAULT_CHART_COLORS });
  }, [qc]);

  // Charts must never receive an invalid color mid-typing: fall back per key.
  const safe = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(DEFAULT_CHART_COLORS) as ChartColorKey[]).map((k) => [k, HEX_RE.test(local[k]) ? local[k] : (data?.colors?.[k] ?? DEFAULT_CHART_COLORS[k])]),
      ) as ChartColors,
    [local, data],
  );

  const value = useMemo(() => ({ colors: safe, setColor, reset, saving, raw: local }), [safe, setColor, reset, saving, local]);
  return <ChartColorsContext.Provider value={value}>{children}</ChartColorsContext.Provider>;
}

export function useChartColors() {
  const ctx = useContext(ChartColorsContext);
  if (!ctx) throw new Error("useChartColors must be used inside ChartColorsProvider");
  return ctx as Ctx & { raw: ChartColors };
}
