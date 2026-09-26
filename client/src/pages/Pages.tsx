import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  Cpu,
  Database,
  Film,
  Gauge,
  KeyRound,
  Lock,
  MinusCircle,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Skeleton } from "@/components/ui/primitives";
import { DemoBadge, EmptyState, ErrorState, PageHeader, ProfileAvatar, SectionTitle } from "@/components/common";
import { DailyActivityChart, DistributionChart, RangePicker, type RangeValue } from "@/components/charts/Charts";
import { SummaryCards } from "@/components/SummaryCards";
import { TrackingCalendar } from "@/components/TrackingCalendar";
import { ActivityTimeline, LiveTrackingControl, ProfileCard, ProfileCardSkeleton, ProfileHistoryTable, ProfileLoader } from "@/components/profile/Profile";
import { ReelViewer } from "@/components/media/Media";
import { AccountCard } from "@/components/auth/Account";
import { ChartColorSettings, SavedProfilesGrid, SearchHistoryTable, SearchProgress } from "@/components/Panels";
import { useProfile, useProfiles, useSystemStatus } from "@/hooks/queries";
import { isBusy, useAppState } from "@/hooks/appState";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Dashboard ─────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { selectedUsername, stage } = useAppState();
  const { data, isLoading, error } = useProfile(selectedUsername);
  const busy = isBusy(stage);

  useEffect(() => {
    if (stage === "done") document.getElementById("selected-profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <span className="text-gradient">Instagram Intelligence Agent</span>
          </h1>
          <p className="text-sm text-muted-foreground">Search, Analyze &amp; Track Instagram Profiles</p>
        </div>
      </div>

      <SummaryCards />
      <SearchProgress />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <DailyActivityChart defaultUsername={selectedUsername} />
        <DistributionChart />
      </div>

      <TrackingCalendar compact />

      <section id="selected-profile" className="scroll-mt-24 space-y-3">
        <SectionTitle title="Selected Profile" description="The most recently searched or selected profile" right={selectedUsername && <Link className="text-sm text-primary hover:underline" to={`/profile/${selectedUsername}`}>Open full profile viewer →</Link>} />
        {busy && !data ? (
          <ProfileCardSkeleton />
        ) : !selectedUsername ? (
          <EmptyState icon={<Search />} title="No profile selected" description="Search an Instagram username or User ID in the search bar above." />
        ) : isLoading ? (
          <ProfileCardSkeleton />
        ) : error || !data ? (
          <ProfileLoader username={selectedUsername} data={data} isLoading={false} error={error} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <div className="space-y-4">
              <ProfileCard profile={data.profile} />
              <LiveTrackingControl username={data.profile.username} />
            </div>
            <ActivityTimeline limit={8} />
          </div>
        )}
      </section>

      {data && selectedUsername && <ReelViewer username={data.profile.username} dataSource={data.profile.dataSource} />}

      <SearchHistoryTable pageSize={8} />
    </div>
  );
}

// ─── Instagram Search ──────────────────────────────────────────────────────
export function SearchPage() {
  const { lastResult, stage, runSearch } = useAppState();
  const { data: profiles } = useProfiles();
  const { data: status } = useSystemStatus();
  const busy = isBusy(stage);
  return (
    <div className="space-y-6">
      <PageHeader title="Instagram Search" description="Look up Business & Creator accounts through the configured, authorized Instagram API." />
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: <Search />, t: "Username or User ID", d: "Enter @username, username, a profile URL, or a numeric User ID." },
            { icon: <ShieldCheck />, t: "Official API only", d: "Business Discovery returns public data of Business & Creator accounts." },
            { icon: <Lock />, t: "No private data", d: "Private and personal accounts are never accessed or scraped." },
          ].map((x) => (
            <div key={x.t} className="flex gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary [&_svg]:size-4">{x.icon}</div>
              <div>
                <p className="text-sm font-medium">{x.t}</p>
                <p className="text-xs text-muted-foreground">{x.d}</p>
              </div>
            </div>
          ))}
        </div>
        {status?.demoData && (
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            <DemoBadge dataSource="mock" /> Mock mode: any valid username returns generated demo data. Try <code>private_demo</code>, <code>notfound_demo</code>, <code>ratelimit_demo</code> or{" "}
            <code>noperm_demo</code> to see the error states.
          </p>
        )}
      </Card>
      <SearchProgress />
      {busy && <ProfileCardSkeleton />}
      {!busy && lastResult && (
        <div className="space-y-3">
          <SectionTitle
            title="Search result"
            description={`${lastResult.fromCache ? "Served from cache" : "Fetched"} ${relativeTime(lastResult.fetchedAt)} · ${lastResult.media.length} media items accessible`}
            right={
              <Button asChild variant="outline" size="sm">
                <Link to={`/profile/${lastResult.profile.username}`}>Open in profile viewer →</Link>
              </Button>
            }
          />
          <ProfileCard profile={lastResult.profile} />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Previously searched profiles</CardTitle>
          <CardDescription>Stored locally — opening one does not call the Instagram API.</CardDescription>
        </CardHeader>
        <CardContent>
          {!profiles ? (
            <Skeleton className="h-24" />
          ) : !profiles.items.length ? (
            <EmptyState title="Nothing searched yet" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.items.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <ProfileAvatar src={p.profilePictureUrl} username={p.username} size={40} />
                  <Link to={`/profile/${p.username}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:underline">@{p.username}</p>
                    <p className="truncate text-xs text-muted-foreground">Checked {relativeTime(p.lastCheckedAt)}</p>
                  </Link>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runSearch(p.username)}>
                    <Search /> Re-check
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Profile viewer page ───────────────────────────────────────────────────
export function ProfilePage() {
  const { username = "" } = useParams();
  const [params] = useSearchParams();
  const u = username.replace(/^@/, "").toLowerCase();
  const { selectProfile, stage } = useAppState();
  const { data, isLoading, error } = useProfile(u);
  useEffect(() => {
    if (data) selectProfile(data.profile.username);
  }, [data, selectProfile]);
  return (
    <div className="space-y-4">
      <SearchProgress />
      {isBusy(stage) && !data ? <ProfileCardSkeleton /> : <ProfileLoader username={u} data={data} isLoading={isLoading} error={error} defaultTab={params.get("tab") ?? "overview"} />}
    </div>
  );
}

// ─── Profile analytics ─────────────────────────────────────────────────────
export function AnalyticsPage() {
  const { selectedUsername, selectProfile } = useAppState();
  const { data: profiles } = useProfiles();
  const [range, setRange] = useState<RangeValue>({ range: "30d" });
  const username = selectedUsername ?? profiles?.items[0]?.username ?? null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile Analytics"
        description="Daily activity, search distribution and date-wise snapshot history."
        right={
          <Select aria-label="Tracked profile" value={username ?? ""} onChange={(e) => selectProfile(e.target.value || null)} className="w-56">
            {!profiles?.items.length && <option value="">No profiles yet</option>}
            {profiles?.items.map((p) => (
              <option key={p.id} value={p.username}>
                @{p.username}
              </option>
            ))}
          </Select>
        }
      />
      <DailyActivityChart defaultUsername={username} />
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Distribution period</p>
          <RangePicker value={range} onChange={setRange} />
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <DistributionChart range={range} />
        {username ? <ProfileHistoryTable username={username} /> : <EmptyState icon={<BarChart3 />} title="No tracked profiles" description="Search a profile to start tracking." />}
      </div>
    </div>
  );
}

// ─── Reel / media viewer ───────────────────────────────────────────────────
export function MediaPage() {
  const { selectedUsername, selectProfile } = useAppState();
  const { data: profiles } = useProfiles();
  const username = selectedUsername ?? profiles?.items[0]?.username ?? null;
  const { data } = useProfile(username);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reel / Media Viewer"
        description="Play reels the API returns with a playable URL; others open on Instagram."
        right={
          <Select aria-label="Profile" value={username ?? ""} onChange={(e) => selectProfile(e.target.value || null)} className="w-56">
            {!profiles?.items.length && <option value="">No profiles yet</option>}
            {profiles?.items.map((p) => (
              <option key={p.id} value={p.username}>
                @{p.username}
              </option>
            ))}
          </Select>
        }
      />
      {username && data ? (
        <ReelViewer username={username} dataSource={data.profile.dataSource} />
      ) : (
        <EmptyState icon={<Film />} title="No profile selected" description="Search a profile to view its accessible reels and videos." />
      )}
    </div>
  );
}

export function HistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Search History" description="Filter by date, username or status, and export to CSV." />
      <SearchHistoryTable pageSize={20} />
    </div>
  );
}

export function CalendarPage() {
  const [params] = useSearchParams();
  return (
    <div className="space-y-6">
      <PageHeader title="Calendar Tracking" description="Dates on which profiles were searched, with per-day analytics snapshots." />
      <TrackingCalendar initialDate={params.get("date")} initialMonth={params.get("month")} />
      <ActivityTimeline limit={20} />
    </div>
  );
}

export function SavedPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Saved Profiles" description="Quick access to profiles you track regularly." />
      <SavedProfilesGrid />
    </div>
  );
}

// ─── API settings ──────────────────────────────────────────────────────────
function Row({ ok, label, value }: { ok: boolean | null; label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0">
      <span className="flex items-center gap-2">
        {ok === null ? <MinusCircle className="size-4 text-muted-foreground" /> : ok ? <CheckCircle2 className="size-4 text-emerald-500" /> : <XCircle className="size-4 text-red-500" />}
        {label}
      </span>
      <span className="text-right text-xs text-muted-foreground">{value ?? (ok ? "Configured" : "Not configured")}</span>
    </div>
  );
}

export function SettingsPage() {
  const { data: s, isLoading, error, refetch } = useSystemStatus();
  return (
    <div className="space-y-6">
      <PageHeader title="API Settings" description="Your account, Instagram/Meta API configuration, live-tracking limits and chart colors." />
      <AccountCard />
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !s ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" /> Instagram / Meta API
              </CardTitle>
              <CardDescription>Secrets live only in <code>server/.env</code>; the browser only sees whether each one is set.</CardDescription>
            </CardHeader>
            <CardContent>
              <Row ok={true} label="API mode" value={s.mode === "mock" ? "mock (DEMO DATA)" : "production"} />
              <Row ok={s.credentials.accessToken} label="INSTAGRAM_ACCESS_TOKEN" />
              <Row ok={s.credentials.businessAccountId} label="INSTAGRAM_BUSINESS_ACCOUNT_ID" />
              <Row ok={s.credentials.appId} label="INSTAGRAM_APP_ID" />
              <Row ok={s.credentials.appSecret} label="INSTAGRAM_APP_SECRET" value={s.credentials.appSecret ? "Configured (appsecret_proof on)" : "Optional — recommended"} />
              <Row ok={null} label="Graph API version" value={s.credentials.graphVersion} />
              <Row ok={s.ai.provider === "openai"} label="OPENAI_API_KEY" value={s.ai.provider === "openai" ? `Configured · ${s.ai.model}` : "Not set — built-in command engine"} />
              <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                To switch modes set <code>INSTAGRAM_API_MODE=production</code> (or <code>mock</code>) in <code>server/.env</code> and restart the server. Demo and production analytics are stored separately and never mixed.
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="size-4 text-primary" /> Rate limits &amp; live tracking
              </CardTitle>
              <CardDescription>How this app stays inside Instagram API limits.</CardDescription>
            </CardHeader>
            <CardContent>
              <Row ok={null} label="Outbound calls (last hour)" value={`${s.rateBudget.used} / ${s.rateBudget.limit}`} />
              <Row ok={!s.rateBudget.cooldownUntil} label="Throttle cooldown" value={s.rateBudget.cooldownUntil ? `Until ${formatDateTime(s.rateBudget.cooldownUntil)}` : "Inactive"} />
              <Row ok={null} label="Profile cache TTL" value={`${s.cache.profileTtlSeconds}s`} />
              <Row ok={null} label="Minimum live refresh" value={`${s.liveTracking.minIntervalMinutes} min`} />
              <Row ok={null} label="Allowed intervals" value={s.liveTracking.allowedIntervals.map((m) => (m === 0 ? "Manual" : `${m}m`)).join(", ")} />
              <Row ok={true} label="Dashboard sign-in" value={s.auth.signupOpenByConfig ? "Required · sign-up open (ALLOW_SIGNUP)" : "Required · sign-up closed"} />
            </CardContent>
          </Card>
        </div>
      )}
      <ChartColorSettings />
    </div>
  );
}

// ─── System status ─────────────────────────────────────────────────────────
export function StatusPage() {
  const { data: s, isLoading, error, refetch, isFetching } = useSystemStatus();
  const tone = { supported: "success", limited: "warning", unavailable: "outline" } as const;
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Status"
        description="Connectivity, data source and what the official API can and cannot provide."
        right={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            Refresh
          </Button>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !s ? (
        <Skeleton className="h-60" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <Server />, label: "Instagram API", ok: s.connected, text: s.connected ? (s.demoData ? "Connected (demo)" : "Connected") : "Not Connected", sub: s.connection.message },
              { icon: <Database />, label: "Database", ok: s.database.ok, text: s.database.ok ? "PostgreSQL online" : "Offline", sub: s.database.message },
              { icon: <Sparkles />, label: "AI Assistant", ok: true, text: s.ai.provider === "openai" ? "OpenAI" : "Local engine", sub: s.ai.model },
              { icon: <Cpu />, label: "Data mode", ok: s.mode === "production", text: s.mode === "mock" ? "Mock (DEMO DATA)" : "Production", sub: s.provider },
            ].map((c) => (
              <Card key={c.label} className="p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground [&_svg]:size-4">
                  {c.icon} {c.label}
                </div>
                <p className="mt-2 flex items-center gap-2 font-semibold">
                  <span className={cn("size-2.5 rounded-full", c.ok ? "bg-emerald-500" : c.label === "Data mode" ? "bg-amber-500" : "bg-red-500")} />
                  {c.text}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.sub}</p>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Instagram API capabilities</CardTitle>
              <CardDescription>Unsupported features show a clear limitation in the UI — they are never worked around.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {s.capabilities.map((c) => (
                <div key={c.feature} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{c.feature}</p>
                    <p className="text-xs text-muted-foreground">{c.note}</p>
                  </div>
                  <Badge variant={tone[c.state]}>{c.state === "supported" ? "Supported" : c.state === "limited" ? "Limited" : "Unavailable"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Last connection check {formatDateTime(s.connection.checkedAt)} · server time {formatDateTime(s.serverTime)} · v{s.version}
          </p>
        </>
      )}
    </div>
  );
}

export function NotFoundPage() {
  return <EmptyState title="Page not found" action={<Button asChild><Link to="/">Back to dashboard</Link></Button>} />;
}
