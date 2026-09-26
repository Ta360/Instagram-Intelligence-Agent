import type { CalendarDay, ChartColorKey, ChartColors, DailyMetric, DayPoint, DistributionSlice } from "./types";
import { formatDayKey } from "./format";

export const METRIC_OPTIONS: { value: DailyMetric; label: string; needsProfile: boolean; color: ChartColorKey }[] = [
  { value: "searchCount", label: "Search Count", needsProfile: false, color: "primary" },
  { value: "followers", label: "Followers Snapshot", needsProfile: true, color: "secondary" },
  { value: "following", label: "Following Snapshot", needsProfile: true, color: "info" },
  { value: "mediaCount", label: "Media Count", needsProfile: true, color: "success" },
  { value: "reelCount", label: "Reel Count", needsProfile: true, color: "accent" },
  { value: "profileChecks", label: "Profile Checks", needsProfile: false, color: "warning" },
];

export interface BarDatum {
  date: string;
  label: string;
  value: number | null;
}

/** API day points → Recharts bar data. Null values stay null (rendered as gaps). */
export function toBarData(points: DayPoint[]): BarDatum[] {
  return points.map((p) => ({ date: p.date, label: formatDayKey(p.date), value: p.value }));
}

export function seriesStats(points: DayPoint[]) {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (!vals.length) return { total: 0, max: null as number | null, latest: null as number | null, daysWithData: 0 };
  return {
    total: vals.reduce((a, b) => a + b, 0),
    max: Math.max(...vals),
    latest: [...points].reverse().find((p) => p.value !== null)!.value,
    daysWithData: vals.length,
  };
}

/** Palette order for multi-slice charts, drawn from the centralized chart colors. */
export const SERIES_ORDER: ChartColorKey[] = ["primary", "accent", "info", "warning", "success", "secondary", "danger"];

export interface PieDatum extends DistributionSlice {
  name: string;
  fill: string;
}

export function toPieData(slices: DistributionSlice[], colors: ChartColors): PieDatum[] {
  return slices.map((s, i) => ({
    ...s,
    name: s.username === "Others" ? "Others" : `@${s.username}`,
    fill: s.username === "Others" ? "#64748B" : colors[SERIES_ORDER[i % SERIES_ORDER.length]!],
  }));
}

/** Calendar intensity bucket → centralized color key (1–3 low, 4–6 medium, 7+ high). */
export function calendarLevel(searches: number): { level: 0 | 1 | 2 | 3; color: ChartColorKey | null } {
  if (searches <= 0) return { level: 0, color: null };
  if (searches <= 3) return { level: 1, color: "secondary" };
  if (searches <= 6) return { level: 2, color: "success" };
  return { level: 3, color: "warning" };
}

export function indexCalendar(days: CalendarDay[]): Map<string, CalendarDay> {
  return new Map(days.map((d) => [d.date, d]));
}

/** Hex → rgba string for translucent fills. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
