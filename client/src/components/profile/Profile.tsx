import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Clock,
  Database,
  ExternalLink,
  Film,
  Globe,
  History,
  ImageIcon,
  LayoutGrid,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  Timer,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ApiUnavailable, AvailabilityBadge, DemoBadge, EmptyState, ErrorState, ProfileAvatar, StatusBadge } from "@/components/common";
import { DailyActivityChart } from "@/components/charts/Charts";
import { MediaGrid, ReelViewer } from "@/components/media/Media";
import { useActivity, useProfileHistory, useSearchHistory, useSystemStatus } from "@/hooks/queries";
import { useLiveTracking } from "@/hooks/useLiveTracking";
import { useAppState } from "@/hooks/appState";
import { api } from "@/lib/api";
import type { ActivityItem, Profile } from "@/lib/types";
import { compactCount, formatCount, formatDateTime, formatDayKey, formatTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Profile card ──────────────────────────────────────────────────────────
function StatBlock({ label, value, field, profile }: { label: string; value: number | null; field: string; profile: Profile }) {
  const avail = profile.fieldAvailability[field];
  return (
    <div className="min-w-0 text-center" title={avail === "unavailable" ? profile.unavailableReasons[field] : undefined}>
      <p className="text-xl font-bold tabular-nums sm:text-2xl">{value === null ? "—" : compactCount(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {value !== null && <p className="text-[10px] tabular-nums text-muted-foreground/80">{formatCount(value)}</p>}
    </div>
  );
}

export function SaveProfileButton({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const saved = Boolean(profile.savedId);
  async function toggle() {
    setBusy(true);
    try {
      if (saved) await api.unsave(profile.savedId!);
      else await api.save(profile.username);
      await Promise.all(["profile", "saved", "profiles", "summary", "activity"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant={saved ? "secondary" : "outline"} size="sm" onClick={toggle} disabled={busy} aria-pressed={saved}>
      {busy ? <Loader2 className="animate-spin" /> : saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
      {saved ? "Saved" : "Save profile"}
    </Button>
  );
}

export function ProfileCard({ profile, actions }: { profile: Profile; actions?: ReactNode }) {
  const fa = profile.fieldAvailability;
  return (
    <Card className="overflow-hidden animate-fade-up">
      <div className="ig-gradient h-20 opacity-80 sm:h-24" />
      <CardContent className="-mt-10 space-y-4 sm:-mt-12">
        <div className="flex flex-wrap items-end gap-4">
          <ProfileAvatar src={profile.profilePictureUrl} username={profile.username} size={96} ring className="shadow-xl" />
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold">@{profile.username}</h2>
              {profile.isVerified === true && (
                <Badge variant="info">
                  <BadgeCheck /> Verified
                </Badge>
              )}
              <DemoBadge dataSource={profile.dataSource} />
            </div>
            {profile.displayName && <p className="truncate text-sm font-medium text-muted-foreground">{profile.displayName}</p>}
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <SaveProfileButton profile={profile} />
            {profile.profileUrl ? (
              <Button asChild size="sm" variant="gradient">
                <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Open Profile
                </a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled title={profile.unavailableReasons.profileUrl ?? "No Instagram URL available"}>
                <ExternalLink /> Open Profile
              </Button>
            )}
            {actions}
          </div>
        </div>

        {profile.bio ? (
          <p className="whitespace-pre-line text-sm">{profile.bio}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Biography unavailable through the API.</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {profile.website && (
            <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-primary hover:underline">
              <Globe className="size-4" /> {profile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          {profile.accountType && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <UserRound className="size-4" /> {profile.accountType.charAt(0) + profile.accountType.slice(1).toLowerCase()} account
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 divide-x rounded-xl border bg-muted/30 py-3">
          <StatBlock label="Followers" value={profile.followersCount} field="followersCount" profile={profile} />
          <StatBlock label="Following" value={profile.followingCount} field="followingCount" profile={profile} />
          <StatBlock label="Posts" value={profile.mediaCount} field="mediaCount" profile={profile} />
        </div>

        <div className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-3.5" /> Last checked: <span className="font-medium text-foreground">{formatDateTime(profile.lastCheckedAt)}</span>
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Database className="size-3.5" /> Data source:
            <span className="font-medium text-foreground">{profile.dataSource === "mock" ? "Demo data (mock mode)" : "Instagram Graph API"}</span>
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            API status:
            <Badge variant={profile.dataSource === "mock" ? "demo" : "success"}>{profile.dataSource === "mock" ? "Mock" : "Authorized"}</Badge>
          </p>
        </div>

        <details className="group rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">Field availability (what the API returned)</summary>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {Object.entries(fa).map(([field, v]) => (
              <div key={field} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</span>
                <AvailabilityBadge value={v} reason={profile.unavailableReasons[field]} />
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function ProfileCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-24 rounded-none" />
      <div className="-mt-12 space-y-4 p-5">
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </Card>
  );
}

// ─── Live tracking ─────────────────────────────────────────────────────────
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function LiveTrackingControl({ username }: { username: string }) {
  const live = useLiveTracking(username);
  const now = useNow();
  const { data: status } = useSystemStatus();
  const nextIn = live.nextRefresh ? Math.max(0, Math.round((live.nextRefresh.getTime() - now) / 1000)) : null;
  const label = (m: number) => (m === 0 ? "Manual" : m === 60 ? "1 hour" : `${m} minutes`);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <Switch checked={live.enabled} onCheckedChange={live.setEnabled} disabled={live.intervalMin === 0} aria-label="Live Tracking" />
          <span className="flex items-center gap-1.5">
            {live.enabled && <span className="size-2 animate-pulse rounded-full bg-emerald-500" />}
            Live Tracking
          </span>
        </label>
        <Select
          aria-label="Refresh interval"
          value={live.intervalMin}
          onChange={(e) => {
            const v = Number(e.target.value);
            live.setIntervalMin(v);
            if (v === 0) live.setEnabled(false);
          }}
          className="w-36"
        >
          {[0, 5, 15, 30, 60].map((m) => (
            <option key={m} value={m} disabled={!live.allowed.includes(m)}>
              {label(m)}
              {!live.allowed.includes(m) ? " (API limit)" : ""}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="outline" onClick={() => void live.refreshNow()} disabled={live.busy}>
          <RefreshCw className={cn(live.busy && "animate-spin")} /> Refresh now
        </Button>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Last updated: <b className="font-medium text-foreground">{live.lastUpdated ? formatTime(live.lastUpdated.toISOString(), true) : "—"}</b>
          </span>
          <span className="flex items-center gap-1">
            <Timer className="size-3.5" /> Next refresh:{" "}
            <b className="font-medium text-foreground">
              {live.enabled && live.nextRefresh ? `${formatTime(live.nextRefresh.toISOString(), true)} (${Math.floor(nextIn! / 60)}m ${nextIn! % 60}s)` : "Off"}
            </b>
          </span>
        </div>
        {live.message && <p className="w-full text-xs text-amber-600 dark:text-amber-400">{live.message}</p>}
        {status?.mode === "production" && (
          <p className="w-full text-[11px] text-muted-foreground">
            Intervals under {status.liveTracking.minIntervalMinutes} minutes are disabled to stay within Instagram API rate limits.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Historical tracking table ─────────────────────────────────────────────
export function ProfileHistoryTable({ username }: { username: string }) {
  const { data, isLoading, error, refetch } = useProfileHistory(username);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-primary" /> Profile Historical Tracking
        </CardTitle>
        <CardDescription>
          @{username} — one row per day with stored data. Values come only from snapshots actually captured; empty cells mean no snapshot that day.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <Skeleton className="h-40" />
        ) : !data.rows.length ? (
          <EmptyState icon={<History />} title="No history yet" description="Search this profile on different days to build a date-wise record." />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {["Date", "Followers", "Following", "Media", "Reels", "Searches", "Snapshots"].map((h, i) => (
                    <th key={h} className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const prev = data.rows[i + 1];
                  const delta = r.followers !== null && prev?.followers != null ? r.followers - prev.followers : null;
                  return (
                    <tr key={r.date} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{formatDayKey(r.date)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCount(r.followers)}
                        {delta !== null && delta !== 0 && (
                          <span className={cn("ml-1.5 text-[11px]", delta > 0 ? "text-emerald-500" : "text-red-500")}>
                            {delta > 0 ? "+" : ""}
                            {formatCount(delta)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCount(r.following)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCount(r.media)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCount(r.reels)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.searches}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.snapshots}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Activity timeline ─────────────────────────────────────────────────────
const ACTIVITY_META: Record<string, { label: (a: ActivityItem) => string; icon: ReactNode; tone: string }> = {
  search: { label: (a) => `Searched @${a.username}`, icon: <Search />, tone: "bg-primary/15 text-primary" },
  search_failed: { label: (a) => `Search for @${a.username} failed (${(a.detail ?? "").replace(/_/g, " ").toLowerCase()})`, icon: <Search />, tone: "bg-red-500/15 text-red-500" },
  view_profile: { label: (a) => `Viewed profile @${a.username}`, icon: <UserRound />, tone: "bg-cyan-500/15 text-cyan-500" },
  play_media: { label: (a) => `Played ${a.detail ?? "available reel"}${a.username ? ` from @${a.username}` : ""}`, icon: <PlayCircle />, tone: "bg-pink-500/15 text-pink-500" },
  save_profile: { label: (a) => `Saved @${a.username}`, icon: <Bookmark />, tone: "bg-violet-500/15 text-violet-500" },
  unsave_profile: { label: (a) => `Removed @${a.username} from saved`, icon: <Bookmark />, tone: "bg-muted text-muted-foreground" },
  live_refresh: { label: (a) => `Live refresh of @${a.username}`, icon: <RefreshCw />, tone: "bg-emerald-500/15 text-emerald-500" },
  manual_refresh: { label: (a) => `Refreshed @${a.username}`, icon: <RefreshCw />, tone: "bg-emerald-500/15 text-emerald-500" },
  export_csv: { label: () => "Exported search history (CSV)", icon: <Database />, tone: "bg-amber-500/15 text-amber-500" },
  assistant_query: { label: (a) => `Asked assistant: “${a.detail ?? ""}”`, icon: <Activity />, tone: "bg-indigo-500/15 text-indigo-500" },
};

export function ActivityTimeline({ username, limit = 12, className }: { username?: string; limit?: number; className?: string }) {
  const { data, isLoading, error, refetch } = useActivity(username, limit);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-primary" /> Activity Timeline
        </CardTitle>
        <CardDescription>{username ? `Recorded events for @${username}` : "Recorded events across the dashboard"}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !data.items.length ? (
          <EmptyState icon={<Activity />} title="No activity yet" />
        ) : (
          <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
            {data.items.map((a) => {
              const meta = ACTIVITY_META[a.type] ?? { label: () => a.type, icon: <Activity />, tone: "bg-muted text-muted-foreground" };
              return (
                <li key={a.id} className="relative flex items-start gap-3">
                  <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-background [&_svg]:size-4", meta.tone)}>{meta.icon}</span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-xs font-semibold tabular-nums text-muted-foreground" title={formatDateTime(a.occurredAt)}>
                      {formatTime(a.occurredAt)} · {relativeTime(a.occurredAt)}
                    </p>
                    <p className="truncate text-sm">{meta.label(a)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Per-profile search history ────────────────────────────────────────────
function ProfileSearchHistory({ username }: { username: string }) {
  const { data, isLoading } = useSearchHistory({ page: 1, pageSize: 20, username });
  if (isLoading || !data) return <Skeleton className="h-40" />;
  if (!data.items.length) return <EmptyState title="No searches recorded" />;
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Searched at</th>
              <th className="px-3 py-2 text-right font-medium">Followers</th>
              <th className="px-3 py-2 text-right font-medium">Media</th>
              <th className="px-3 py-2 text-right font-medium">Reels accessible</th>
              <th className="px-3 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2">{formatDateTime(e.searchedAt)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(e.followersSnapshot)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(e.mediaCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(e.accessibleReelCount)}</td>
                <td className="px-3 py-2 text-right">
                  <StatusBadge status={e.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Tabbed in-app profile viewer ──────────────────────────────────────────
let lastViewLog = { username: "", at: 0 };

export function ProfileViewer({ profile, defaultTab = "overview" }: { profile: Profile; defaultTab?: string }) {
  const u = profile.username;
  useEffect(() => {
    // One "viewed profile" event per visit (guards against double-mounts).
    if (lastViewLog.username === u && Date.now() - lastViewLog.at < 5000) return;
    lastViewLog = { username: u, at: Date.now() };
    void api.logActivity("view_profile", u);
  }, [u]);

  return (
    <div className="space-y-4">
      <ProfileCard profile={profile} />
      <LiveTrackingControl username={u} />
      <Tabs defaultValue={defaultTab} key={u}>
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutGrid /> Profile Overview
          </TabsTrigger>
          <TabsTrigger value="posts">
            <ImageIcon /> Posts
          </TabsTrigger>
          <TabsTrigger value="reels">
            <Film /> Reels / Video
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 /> Analytics
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> Search History
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Activity /> Activity Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent media</CardTitle>
                <CardDescription>Latest accessible posts & reels</CardDescription>
              </CardHeader>
              <CardContent>
                <MediaGrid username={u} type="all" dataSource={profile.dataSource} />
              </CardContent>
            </Card>
            <div className="space-y-4">
              <ProfileHistoryTable username={u} />
              <ApiUnavailable
                title="Not available through the official API"
                description="Stories, followers/following lists, private posts and direct messages of other accounts are not provided by the Instagram Graph API, so they are not shown."
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="posts">
          <MediaGrid username={u} type="posts" dataSource={profile.dataSource} />
        </TabsContent>
        <TabsContent value="reels">
          <ReelViewer username={u} dataSource={profile.dataSource} />
        </TabsContent>
        <TabsContent value="analytics" className="space-y-4">
          <DailyActivityChart defaultUsername={u} scopeToProfile />
          <ProfileHistoryTable username={u} />
        </TabsContent>
        <TabsContent value="history">
          <ProfileSearchHistory username={u} />
        </TabsContent>
        <TabsContent value="timeline">
          <ActivityTimeline username={u} limit={40} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Loads a stored profile by username and renders the viewer (or a clear state). */
export function ProfileLoader({ username, data, isLoading, error, defaultTab }: { username: string; data?: { profile: Profile }; isLoading: boolean; error: unknown; defaultTab?: string }) {
  const { runSearch, stage } = useAppState();
  if (isLoading) return <ProfileCardSkeleton />;
  if (error || !data) {
    const e = error as { code?: string; message?: string } | null;
    if (e?.code === "NOT_FOUND")
      return (
        <EmptyState
          icon={<Search />}
          title={`@${username} hasn't been searched yet`}
          description="Profile data is only loaded when you search, so each lookup is recorded and uses API quota deliberately."
          action={
            <Button variant="gradient" onClick={() => void runSearch(username)} disabled={stage !== "idle" && stage !== "done" && stage !== "error"}>
              <Search /> Search @{username}
            </Button>
          }
        />
      );
    return <ErrorState error={(error as Error) ?? new Error("Unable to load profile")} />;
  }
  return <ProfileViewer profile={data.profile} defaultTab={defaultTab} />;
}
