/**
 * Timezone-aware day helpers built on Intl (no extra dependency).
 * A "day key" is a calendar date string "YYYY-MM-DD" in a given IANA timezone.
 */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : "UTC";
}

function zonedParts(date: Date, tz: string) {
  const p = Object.fromEntries(partsFormatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Offset (minutes) of `tz` from UTC at the given instant. */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

export function dayKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function isDayKey(v: unknown): v is string {
  if (typeof v !== "string" || !DAY_KEY_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isMonthKey(v: unknown): v is string {
  if (typeof v !== "string" || !MONTH_KEY_RE.test(v)) return false;
  const m = Number(v.slice(5));
  return m >= 1 && m <= 12;
}

/** UTC instant at which the given local day starts in `tz` (DST-safe). */
export function startOfZonedDay(key: string, tz: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let ts = guess - tzOffsetMinutes(new Date(guess), tz) * 60000;
  // Re-check once in case the offset differs at the corrected instant (DST boundary).
  ts = guess - tzOffsetMinutes(new Date(ts), tz) * 60000;
  return new Date(ts);
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Inclusive list of day keys from `from` to `to`. */
export function eachDay(from: string, to: string, max = 400): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < max) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** [start, endExclusive) UTC instants covering local days from..to inclusive. */
export function zonedRange(from: string, to: string, tz: string): { start: Date; end: Date } {
  return { start: startOfZonedDay(from, tz), end: startOfZonedDay(addDays(to, 1), tz) };
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
