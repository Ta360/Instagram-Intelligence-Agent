import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bookmark,
  Bot,
  CalendarDays,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  PlayCircle,
  Search,
  Server,
  Settings,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/primitives";
import { AssistantPanel } from "@/components/AssistantPanel";
import { UserMenu } from "@/components/auth/Account";
import { useSystemStatus } from "@/hooks/queries";
import { useAppState } from "@/hooks/appState";
import { useTheme } from "@/theme/themeProvider";
import { cn } from "@/lib/utils";
import { SearchBar } from "./SearchBar";

export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/search", label: "Instagram Search", icon: Search },
  { to: "/analytics", label: "Profile Analytics", icon: BarChart3 },
  { to: "/media", label: "Reel / Media Viewer", icon: PlayCircle },
  { to: "/history", label: "Search History", icon: History },
  { to: "/calendar", label: "Calendar Tracking", icon: CalendarDays },
  { to: "/saved", label: "Saved Profiles", icon: Bookmark },
  { to: "/settings", label: "API Settings", icon: Settings },
  { to: "/status", label: "System Status", icon: Server },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="size-9" />
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight">Instagram Intelligence</p>
        <p className="text-[11px] font-medium text-muted-foreground">Agent Dashboard</p>
      </div>
    </div>
  );
}

function ConnectionStatus() {
  const { data, isError } = useSystemStatus();
  const connected = Boolean(data?.connected) && !isError;
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs font-semibold">Instagram Intelligence Agent</p>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <span className={cn("relative flex size-2.5")}>
          {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={cn("relative inline-flex size-2.5 rounded-full", connected ? "bg-emerald-500" : "bg-red-500")} />
        </span>
        <span className="font-medium">{connected ? "Connected" : "Not Connected"}</span>
        {data?.demoData && <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">DEMO</span>}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={data?.provider}>
        {data ? (data.mode === "mock" ? "Mock mode · sample data" : "Instagram Graph API") : isError ? "Server unreachable" : "Checking…"}
      </p>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              isActive && "bg-primary/12 text-foreground shadow-[inset_2px_0_0] shadow-primary",
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { assistantOpen, setAssistantOpen } = useAppState();
  const { theme, toggle } = useTheme();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-y-0 border-l-0 p-4 lg:flex">
        <Logo />
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <NavItems />
        </div>
        <ConnectionStatus />
      </aside>

      {/* Mobile navigation */}
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" title="Navigation" className="max-w-72 p-4">
        <div className="flex h-full flex-col gap-6">
          <Logo />
          <div className="flex-1 overflow-y-auto">
            <NavItems onNavigate={() => setMobileOpen(false)} />
          </div>
          <ConnectionStatus />
        </div>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] items-center gap-2 px-4 py-3 sm:gap-3 lg:px-8">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu />
            </Button>
            <SearchBar className="max-w-3xl" />
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
              <Button variant="outline" onClick={() => setAssistantOpen(true)} className="gap-2" aria-label="Open AI Assistant">
                <Bot className="text-primary" />
                <span className="hidden md:inline">AI Assistant</span>
              </Button>
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>

        <footer className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-2 px-4 pb-6 text-xs text-muted-foreground lg:px-8">
          <Activity className="size-3.5" /> Uses only official Instagram/Meta APIs. Private profiles and restricted data are never accessed.
        </footer>
      </div>

      <Sheet open={assistantOpen} onClose={() => setAssistantOpen(false)} title="AI Assistant" className="max-w-lg">
        <AssistantPanel onNavigate={() => setAssistantOpen(false)} />
      </Sheet>
    </div>
  );
}
