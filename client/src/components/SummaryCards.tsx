import type { ReactNode } from "react";
import { Clock, Film, Search, Users, Zap } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/primitives";
import { DemoBadge, ErrorState } from "@/components/common";
import { useSummary } from "@/hooks/queries";
import { useChartColors } from "@/theme/chartTheme";
import { formatCount, relativeTime } from "@/lib/format";
import { withAlpha } from "@/lib/chartTransforms";

function Stat({ label, value, sub, icon, color }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; color: string }) {
  return (
    <Card className="relative overflow-hidden p-4 animate-fade-up">
      <div className="absolute -right-6 -top-6 size-24 rounded-full blur-2xl" style={{ background: withAlpha(color, 0.25) }} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="mt-1.5 truncate text-2xl font-bold tracking-tight">{value}</div>
          {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5" style={{ background: withAlpha(color, 0.15), color }}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

export function SummaryCards() {
  const { data, isLoading, error, refetch } = useSummary();
  const { colors } = useChartColors();
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
    );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total Searches" value={formatCount(data.totalSearches)} icon={<Search />} color={colors.primary} />
        <Stat label="Profiles Tracked" value={formatCount(data.profilesTracked)} sub={`${data.savedProfiles} saved`} icon={<Users />} color={colors.secondary} />
        <Stat label="Searches Today" value={formatCount(data.searchesToday)} icon={<Zap />} color={colors.success} />
        <Stat label="Videos/Reels Available" value={formatCount(data.mediaAvailable)} icon={<Film />} color={colors.accent} />
        <Stat
          label="Last Search"
          value={data.lastSearch ? <span className="text-lg">@{data.lastSearch.username}</span> : "—"}
          sub={data.lastSearch ? relativeTime(data.lastSearch.searchedAt) : "No searches yet"}
          icon={<Clock />}
          color={colors.info}
        />
      </div>
      {data.dataSource === "mock" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <DemoBadge dataSource="mock" /> Mock mode is active — every number on this dashboard is synthetic sample data and is stored separately from real analytics.
        </p>
      )}
    </div>
  );
}
