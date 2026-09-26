import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, PieChart as PieIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Skeleton } from "@/components/ui/primitives";
import { DemoBadge, EmptyState, ErrorState } from "@/components/common";
import { useDaily, useDistribution, useProfiles, useSummary } from "@/hooks/queries";
import { useChartColors } from "@/theme/chartTheme";
import { METRIC_OPTIONS, seriesStats, toBarData, toPieData, withAlpha } from "@/lib/chartTransforms";
import type { RangeQuery } from "@/lib/api";
import type { DailyMetric } from "@/lib/types";
import { addDaysKey, localDayKey } from "@/lib/dates";
import { compactCount, formatCount, formatDayKey } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Range picker ──────────────────────────────────────────────────────────
export type RangeValue = { range: "today" | "7d" | "30d" | "90d" | "custom"; from?: string; to?: string };
const PRESETS: { value: RangeValue["range"]; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "custom", label: "Custom" },
];

export function toRangeQuery(v: RangeValue): RangeQuery {
  return v.range === "custom" ? { range: "custom", from: v.from, to: v.to } : { range: v.range };
}

export function RangePicker({ value, onChange, className }: { value: RangeValue; onChange: (v: RangeValue) => void; className?: string }) {
  const today = localDayKey();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="inline-flex rounded-lg bg-muted/70 p-1" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() =>
              onChange(p.value === "custom" ? { range: "custom", from: value.from ?? addDaysKey(today, -13), to: value.to ?? today } : { range: p.value })
            }
            aria-pressed={value.range === p.value}
            className={cn(
              "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors",
              value.range === p.value && "bg-card-solid text-foreground shadow-sm",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.range === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="From date" className="h-8 w-[9.5rem] text-xs" max={value.to ?? today} value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" aria-label="To date" className="h-8 w-[9.5rem] text-xs" min={value.from} max={today} value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number | null; payload: { date?: string } }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]!.value;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium">{payload[0]!.payload.date ? formatDayKey(payload[0]!.payload.date, "long") : label}</p>
      <p className="text-muted-foreground">
        {unit}: <span className="font-semibold text-foreground">{v === null || v === undefined ? "No data captured" : formatCount(v)}</span>
      </p>
    </div>
  );
}

// ─── Daily activity bar chart ──────────────────────────────────────────────
export function DailyActivityChart({
  defaultUsername,
  scopeToProfile = false,
  className,
}: {
  defaultUsername?: string | null;
  /** When true (profile viewer), count metrics are filtered to the profile too. */
  scopeToProfile?: boolean;
  className?: string;
}) {
  const { colors } = useChartColors();
  const [range, setRange] = useState<RangeValue>({ range: "7d" });
  const [metric, setMetric] = useState<DailyMetric>("searchCount");
  const [picked, setPicked] = useState<string | null>(null);
  const { data: profiles } = useProfiles();
  const { data: summary } = useSummary();
  const opt = METRIC_OPTIONS.find((m) => m.value === metric)!;

  useEffect(() => setPicked(null), [defaultUsername]);

  // Snapshot metrics need one profile; count metrics default to "All profiles" unless scoped.
  const username =
    picked !== null && (picked || !opt.needsProfile)
      ? picked
      : opt.needsProfile
        ? (defaultUsername ?? profiles?.items[0]?.username ?? "")
        : scopeToProfile
          ? (defaultUsername ?? "")
          : "";
  const setUsername = setPicked;

  const customIncomplete = range.range === "custom" && (!range.from || !range.to);
  const enabled = !customIncomplete && (!opt.needsProfile || Boolean(username));
  const { data, isLoading, error, refetch } = useDaily(
    { ...toRangeQuery(range), metric, username: username || undefined },
    enabled,
  );
  const bars = useMemo(() => toBarData(data?.points ?? []), [data]);
  const stats = useMemo(() => seriesStats(data?.points ?? []), [data]);
  const color = colors[opt.color];

  return (
    <Card className={className}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" /> Instagram Profile Daily Activity
            </CardTitle>
            <CardDescription>
              {opt.needsProfile ? "Stored snapshot values — days without a snapshot are left empty." : "Counts from recorded search & check events."}
            </CardDescription>
          </div>
          <DemoBadge dataSource={summary?.dataSource} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Metric" value={metric} onChange={(e) => setMetric(e.target.value as DailyMetric)} className="w-44">
            {METRIC_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Profile" value={username} onChange={(e) => setUsername(e.target.value)} className="w-44">
            {!opt.needsProfile && <option value="">All profiles</option>}
            {opt.needsProfile && !profiles?.items.length && <option value="">No profiles yet</option>}
            {profiles?.items.map((p) => (
              <option key={p.id} value={p.username}>
                @{p.username}
              </option>
            ))}
          </Select>
          <RangePicker value={range} onChange={setRange} />
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : opt.needsProfile && !username ? (
          <EmptyState icon={<BarChart3 />} title="No profile selected" description="Search a profile to chart its stored snapshots." />
        ) : isLoading || !data ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {opt.needsProfile ? (
                <>
                  <span>
                    Latest: <b className="text-foreground">{formatCount(stats.latest)}</b>
                  </span>
                  <span>
                    Days with snapshots: <b className="text-foreground">{stats.daysWithData}</b>
                  </span>
                </>
              ) : (
                <>
                  <span>
                    Total: <b className="text-foreground">{formatCount(stats.total)}</b>
                  </span>
                  <span>
                    Peak day: <b className="text-foreground">{formatCount(stats.max)}</b>
                  </span>
                </>
              )}
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`bar-${metric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={1} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => compactCount(v)} width={48} domain={opt.needsProfile ? ["auto", "auto"] : [0, "auto"]} />
                  <Tooltip content={<ChartTooltip unit={opt.label} />} cursor={{ fill: withAlpha(color, 0.08) }} />
                  <Bar dataKey="value" name={opt.label} fill={`url(#bar-${metric})`} radius={[6, 6, 0, 0]} maxBarSize={42} animationDuration={500} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Search distribution donut ─────────────────────────────────────────────
export function DistributionChart({ className, range: controlledRange }: { className?: string; range?: RangeValue }) {
  const { colors } = useChartColors();
  const [localRange, setLocalRange] = useState<RangeValue>({ range: "30d" });
  const range = controlledRange ?? localRange;
  const customIncomplete = range.range === "custom" && (!range.from || !range.to);
  const { data, isLoading, error, refetch } = useDistribution(customIncomplete ? { range: "30d" } : toRangeQuery(range));
  const { data: summary } = useSummary();
  const pie = useMemo(() => toPieData(data?.slices ?? [], colors), [data, colors]);
  const [hover, setHover] = useState<number | null>(null);

  return (
    <Card className={className}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PieIcon className="size-4 text-primary" /> Profile Search Distribution
            </CardTitle>
            <CardDescription>Share of searches per username in the selected period.</CardDescription>
          </div>
          <DemoBadge dataSource={summary?.dataSource} />
        </div>
        {!controlledRange && <RangePicker value={localRange} onChange={setLocalRange} />}
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <Skeleton className="mx-auto size-56 rounded-full" />
        ) : !pie.length ? (
          <EmptyState icon={<PieIcon />} title="No searches in this period" description="Search a profile to start building the distribution." />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
            <div className="relative h-56 w-56 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="count"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="95%"
                    paddingAngle={pie.length > 1 ? 2 : 0}
                    stroke="none"
                    onMouseEnter={(_, i) => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    animationDuration={500}
                  >
                    {pie.map((d, i) => (
                      <Cell key={d.name} fill={d.fill} opacity={hover === null || hover === i ? 1 : 0.35} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                          <p className="font-medium">{String(payload[0]!.name)}</p>
                          <p className="text-muted-foreground">
                            {formatCount(payload[0]!.value as number)} searches · {(payload[0]!.payload as { percent: number }).percent}%
                          </p>
                        </div>
                      ) : null
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-2xl font-bold">{hover !== null ? `${pie[hover]!.percent}%` : formatCount(data.total)}</p>
                  <p className="text-xs text-muted-foreground">{hover !== null ? pie[hover]!.name : "searches"}</p>
                </div>
              </div>
            </div>
            <ul className="w-full min-w-0 space-y-1.5 text-sm">
              {pie.map((d, i) => (
                <li
                  key={d.name}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  className={cn("flex items-center gap-2 rounded-md px-2 py-1 transition-colors", hover === i && "bg-accent")}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.fill }} />
                  <span className="truncate font-medium">{d.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{d.percent}%</span>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{d.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
