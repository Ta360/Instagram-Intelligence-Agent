import { parseDayKey } from "./dates";

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US");
}

export function compactCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatTime(iso: string, seconds = false): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDayKey(key: string, style: "short" | "long" = "short"): string {
  const d = parseDayKey(key);
  return style === "long"
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(diff, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const STATUS_LABEL: Record<string, string> = {
  SUCCESS: "Success",
  NOT_FOUND: "Not found",
  PRIVATE: "Private",
  PERMISSION_REQUIRED: "Permission required",
  RATE_LIMITED: "Rate limited",
  NETWORK_ERROR: "Network error",
  INVALID_INPUT: "Invalid input",
};
