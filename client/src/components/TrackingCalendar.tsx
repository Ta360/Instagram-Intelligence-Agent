import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives";
import { DemoBadge, EmptyState, ErrorState } from "@/components/common";
import { useCalendar, useDateAnalytics, useSummary } from "@/hooks/queries";
import { useChartColors } from "@/theme/chartTheme";
import { calendarLevel, indexCalendar, withAlpha } from "@/lib/chartTransforms";
import { localDayKey, monthGrid, monthKey, parseDayKey, shiftMonth } from "@/lib/dates";
import { formatCount, formatDayKey, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TrackingCalendar({
  initialDate,
  initialMonth,
  compact = false,
  className,
}: {
  initialDate?: string | null;
  initialMonth?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const today = localDayKey();
  const [month, setMonth] = useState(initialMonth ?? initialDate?.slice(0, 7) ?? monthKey());
  const [selected, setSelected] = useState<string | null>(initialDate ?? today);
  const { data, isLoading, error, refetch } = useCalendar(month);
  const { colors } = useChartColors();
  const { data: summary } = useSummary();

  useEffect(() => {
    if (initialDate) {
      setSelected(initialDate);
      setMonth(initialDate.slice(0, 7));
    }
  }, [initialDate]);
  useEffect(() => {
    if (initialMonth) setMonth(initialMonth);
  }, [initialMonth]);

  const byDay = useMemo(() => indexCalendar(data?.days ?? []), [data]);
  const grid = useMemo(() => monthGrid(month), [month]);
  const monthLabel = parseDayKey(`${month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const monthTotal = (data?.days ?? []).reduce((s, d) => s + d.searches, 0);

  return (
    <div className={cn("grid gap-4", compact ? "xl:grid-cols-[1.25fr_1fr]" : "lg:grid-cols-[1.4fr_1fr]", className)}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" /> Instagram Tracking Calendar
              </CardTitle>
              <CardDescription>
                {formatCount(monthTotal)} searches recorded in {monthLabel}. Click a date for details.
              </CardDescription>
            </div>
            <DemoBadge dataSource={summary?.dataSource} />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{monthLabel}</span>
              {month !== monthKey() && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setMonth(monthKey());
                    setSelected(today);
                  }}
                >
                  Today
                </Button>
              )}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month" disabled={month >= monthKey()}>
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isLoading && !data ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1">
                    {d.slice(0, compact ? 1 : 3)}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Searches in ${monthLabel}`}>
                {grid.map(({ key, inMonth }) => {
                  const day = byDay.get(key);
                  const { color } = calendarLevel(day?.searches ?? 0);
                  const hex = color ? colors[color] : null;
                  const isSel = key === selected;
                  const future = key > today;
                  return (
                    <button
                      key={key}
                      role="gridcell"
                      disabled={future}
                      onClick={() => setSelected(key)}
                      aria-selected={isSel}
                      aria-label={`${formatDayKey(key, "long")}: ${day?.searches ?? 0} searches`}
                      className={cn(
                        "relative flex aspect-square min-h-10 cursor-pointer flex-col items-center justify-center rounded-lg border border-transparent text-sm transition-all hover:border-border disabled:cursor-default disabled:opacity-30",
                        !inMonth && "opacity-35",
                        isSel && "ring-2 ring-primary",
                        key === today && "font-bold",
                      )}
                      style={hex ? { background: withAlpha(hex, 0.16), borderColor: withAlpha(hex, 0.35) } : undefined}
                    >
                      <span className={cn(key === today && "text-primary")}>{parseDayKey(key).getDate()}</span>
                      {day && (
                        <span className="mt-0.5 flex items-center gap-0.5 text-[10px] font-semibold leading-none" style={{ color: hex ?? undefined }}>
                          <span className="size-1.5 rounded-full" style={{ background: hex ?? undefined }} />
                          {day.searches}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                {(["secondary", "success", "warning"] as const).map((k, i) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: colors[k] }} />
                    {["1–3 searches", "4–6 searches", "7+ searches"][i]}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <DayDetail date={selected} />
    </div>
  );
}

export function DayDetail({ date }: { date: string | null }) {
  const { data, isLoading, error, refetch } = useDateAnalytics(date);
  const { colors } = useChartColors();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Instagram Activity</CardTitle>
        <CardDescription>{date ? formatDayKey(date, "long") : "Select a date"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!date ? (
          <EmptyState title="No date selected" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-24" />
          </div>
        ) : !data.totalSearches && !data.snapshots.length ? (
          <EmptyState icon={<CalendarDays />} title="No activity on this date" description="Nothing was searched or captured on this day." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Search className="size-3.5" /> Total Searches
                </p>
                <p className="text-2xl font-bold" style={{ color: colors.primary }}>
                  {data.totalSearches}
                </p>
                <p className="text-[11px] text-muted-foreground">{data.successfulSearches} successful</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" /> Profiles Checked
                </p>
                <p className="text-2xl font-bold" style={{ color: colors.secondary }}>
                  {data.profilesChecked}
                </p>
                <p className="text-[11px] text-muted-foreground">{data.snapshots.length} snapshots stored</p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Profile usernames</p>
              <div className="flex flex-wrap gap-1.5">
                {data.profiles.map((p) => (
                  <Link key={p.username} to={p.username.startsWith("id:") ? "/history" : `/profile/${p.username}`}>
                    <Badge variant={p.statuses.SUCCESS ? "default" : "outline"} className="cursor-pointer py-1 text-xs hover:brightness-110">
                      @{p.username} · {p.searches}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
            {data.snapshots.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analytics snapshots</p>
                <div className="max-h-64 overflow-auto rounded-lg border scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card-solid text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Time</th>
                        <th className="px-2 py-1.5 text-left font-medium">Profile</th>
                        <th className="px-2 py-1.5 text-right font-medium">Followers</th>
                        <th className="px-2 py-1.5 text-right font-medium">Media</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.snapshots.map((s) => (
                        <tr key={s.id} className="border-t">
                          <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{formatTime(s.capturedAt)}</td>
                          <td className="px-2 py-1.5 font-medium">@{s.username}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCount(s.followersCount)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCount(s.mediaCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
