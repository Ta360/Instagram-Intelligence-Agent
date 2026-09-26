import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, Download, Eye, Filter, History, Loader2, Palette, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Skeleton } from "@/components/ui/primitives";
import { DemoBadge, EmptyState, ErrorState, ProfileAvatar, StatusBadge } from "@/components/common";
import { Pager } from "@/components/media/Media";
import { useSaved, useSearchHistory, useSummary } from "@/hooks/queries";
import { STAGE_LABEL, isBusy, useAppState, useDebounced, type SearchStage } from "@/hooks/appState";
import { CHART_COLOR_LABELS, useChartColors } from "@/theme/chartTheme";
import { api } from "@/lib/api";
import type { ChartColorKey, SearchStatus } from "@/lib/types";
import { HEX_RE } from "@/lib/validation";
import { STATUS_LABEL, compactCount, formatCount, formatDate, formatTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Staged search progress ────────────────────────────────────────────────
const STAGES: SearchStage[] = ["searching", "profile", "media", "analytics"];

export function SearchProgress() {
  const { stage, error, lastQuery, clearSearch, runSearch } = useAppState();
  if (stage === "idle" || stage === "done") return null;
  if (stage === "error" && error)
    return (
      <div className="relative animate-fade-up">
        <ErrorState error={error} onRetry={["NETWORK_ERROR", "INTERNAL"].includes(error.code) ? () => void runSearch(lastQuery) : undefined} />
        <button onClick={clearSearch} className="absolute right-2 top-2 cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
    );
  const idx = STAGES.indexOf(stage);
  return (
    <Card className="animate-fade-up p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {STAGES.map((s, i) => (
          <div key={s} className={cn("flex items-center gap-2 text-sm", i > idx && "text-muted-foreground/60")}>
            {i < idx ? <Check className="size-4 text-emerald-500" /> : i === idx ? <Loader2 className="size-4 animate-spin text-primary" /> : <span className="size-4 rounded-full border" />}
            <span className={cn(i === idx && "font-medium")}>{STAGE_LABEL[s]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
        <div className="ig-gradient h-full transition-all duration-500" style={{ width: `${((idx + 1) / STAGES.length) * 100}%` }} />
      </div>
    </Card>
  );
}

export const searchInFlight = (s: SearchStage) => isBusy(s);

// ─── Search history table ──────────────────────────────────────────────────
const STATUSES = Object.keys(STATUS_LABEL) as SearchStatus[];

export function SearchHistoryTable({ pageSize = 15, compact = false }: { pageSize?: number; compact?: boolean }) {
  const [page, setPage] = useState(1);
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<SearchStatus | "">("");
  const [date, setDate] = useState("");
  const debouncedUser = useDebounced(username, 300);
  const filters = { username: debouncedUser || undefined, status, from: date || undefined, to: date || undefined };
  const { data, isLoading, error, refetch, isFetching } = useSearchHistory({ page, pageSize, ...filters });
  const { data: summary } = useSummary();
  const navigate = useNavigate();
  const { selectProfile } = useAppState();
  const hasFilters = Boolean(username || status || date);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-primary" /> Search History
            </CardTitle>
            <CardDescription>{data ? `${formatCount(data.total)} recorded searches` : "Every search is stored with its timestamp and status."}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <DemoBadge dataSource={summary?.dataSource} />
            <Button asChild size="sm" variant="outline">
              <a href={api.exportCsvUrl({ username: filters.username, status: status || undefined, from: filters.from, to: filters.to })} download onClick={() => void api.logActivity("export_csv")}>
                <Download /> Export CSV
              </a>
            </Button>
          </div>
        </div>
        {!compact && (
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Input
              placeholder="Filter by username"
              aria-label="Filter by username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setPage(1);
              }}
              className="h-8 w-44"
            />
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as SearchStatus | "");
                setPage(1);
              }}
              className="w-44 [&_select]:h-8"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              aria-label="Filter by date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="h-8 w-40"
            />
            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setUsername("");
                  setStatus("");
                  setDate("");
                  setPage(1);
                }}
              >
                <X /> Clear
              </Button>
            )}
            {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <Skeleton className="h-60" />
        ) : !data.items.length ? (
          <EmptyState icon={<History />} title={hasFilters ? "No searches match these filters" : "No searches yet"} description={hasFilters ? undefined : "Use the search bar to look up an Instagram username."} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    {["Username", "Profile Name", "Search Date", "Search Time", "Followers Snapshot", "Media Count", "Search Status", ""].map((h, i) => (
                      <th key={i} className={cn("px-3 py-2 font-medium", i >= 4 && i <= 5 ? "text-right" : "text-left")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id} className="border-t transition-colors hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">@{e.username}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-muted-foreground">{e.profileName ?? "—"}</td>
                      <td className="px-3 py-2">{formatDate(e.searchedAt)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatTime(e.searchedAt, true)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCount(e.followersSnapshot)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCount(e.mediaCount)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {e.profileId && !e.username.startsWith("id:") ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              selectProfile(e.username);
                              navigate(`/profile/${e.username}`);
                            }}
                          >
                            <Eye /> View Profile
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.totalPages > 1 && <Pager page={page} totalPages={data.totalPages} onChange={setPage} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Saved profiles ────────────────────────────────────────────────────────
export function SavedProfilesGrid() {
  const { data, isLoading, error, refetch } = useSaved();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { selectProfile } = useAppState();
  const [removing, setRemoving] = useState<string | null>(null);

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    );
  if (!data.items.length)
    return <EmptyState icon={<Bookmark />} title="No saved profiles" description="Search a profile and click “Save profile” to keep it here for quick access." />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {data.items.map(({ id, profile }) => (
        <Card key={id} className="animate-fade-up p-4">
          <div className="flex items-center gap-3">
            <ProfileAvatar src={profile.profilePictureUrl} username={profile.username} size={56} ring />
            <div className="min-w-0">
              <p className="truncate font-semibold">@{profile.username}</p>
              <p className="truncate text-sm text-muted-foreground">{profile.displayName ?? "—"}</p>
              <DemoBadge dataSource={profile.dataSource} className="mt-1" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-muted-foreground">Followers</p>
              <p className="text-base font-semibold">{compactCount(profile.followersCount)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-muted-foreground">Last checked</p>
              <p className="font-semibold" title={profile.lastCheckedAt}>
                {relativeTime(profile.lastCheckedAt)}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                selectProfile(profile.username);
                navigate(`/profile/${profile.username}?tab=analytics`);
              }}
            >
              <Eye /> Quick View
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={removing === id}
              onClick={async () => {
                setRemoving(id);
                try {
                  await api.unsave(id);
                  await Promise.all(["saved", "profile", "profiles", "summary", "activity"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
                } finally {
                  setRemoving(null);
                }
              }}
              aria-label={`Remove @${profile.username} from saved`}
            >
              {removing === id ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Chart color settings ──────────────────────────────────────────────────
export function ChartColorSettings() {
  const { raw, colors, setColor, reset, saving } = useChartColors();
  const keys = Object.keys(CHART_COLOR_LABELS) as ChartColorKey[];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-4 text-primary" /> Chart Color Settings
            </CardTitle>
            <CardDescription>Centralized hexadecimal palette used by every chart and the calendar. Changes apply instantly and are saved.</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saving && (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Saving…
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => void reset()}>
              <RotateCcw /> Reset defaults
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {keys.map((k) => {
          const valid = HEX_RE.test(raw[k]);
          return (
            <label key={k} className="flex items-center gap-3 rounded-lg border p-2.5">
              <input
                type="color"
                value={colors[k]}
                onChange={(e) => setColor(k, e.target.value.toUpperCase())}
                className="size-9 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
                aria-label={`${CHART_COLOR_LABELS[k]} color picker`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{CHART_COLOR_LABELS[k]} Color</p>
                <Input
                  value={raw[k]}
                  onChange={(e) => setColor(k, e.target.value.trim().toUpperCase())}
                  aria-label={`${CHART_COLOR_LABELS[k]} hex value`}
                  aria-invalid={!valid}
                  maxLength={7}
                  className={cn("mt-0.5 h-7 font-mono text-xs uppercase", !valid && "border-red-500 focus-visible:ring-red-500/40")}
                />
              </div>
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function SavedLink() {
  return (
    <Link to="/saved" className="text-sm text-primary hover:underline">
      View all saved profiles →
    </Link>
  );
}
