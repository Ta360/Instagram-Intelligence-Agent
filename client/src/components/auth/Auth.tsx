import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CalendarDays, Eye, EyeOff, Loader2, Lock, LogIn, Search, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Input, Skeleton } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/api";
import type { AuthUser } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Auth context ──────────────────────────────────────────────────────────
interface AuthCtx {
  user: AuthUser;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthGate");
  return c;
}

/**
 * Renders the dashboard only for a signed-in account; otherwise the Sign in /
 * Sign up screen. Any 401 from the API (expired or revoked session) returns here.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["auth"], queryFn: api.authStatus, staleTime: 5 * 60_000, retry: 1 });

  useEffect(() => {
    const onUnauthorized = () => void qc.invalidateQueries({ queryKey: ["auth"] });
    window.addEventListener("iia:unauthorized", onUnauthorized);
    return () => window.removeEventListener("iia:unauthorized", onUnauthorized);
  }, [qc]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Skeleton className="h-80 w-full max-w-md rounded-2xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <Card className="max-w-sm p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 size-8 text-amber-500" />
          <p className="font-semibold">Can&apos;t reach the dashboard server</p>
          <p className="mt-1 text-sm text-muted-foreground">Make sure the API is running, then try again.</p>
          <Button className="mt-4" onClick={() => void refetch()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }
  if (!data.authenticated || !data.user) {
    return <AuthPage signupOpen={data.signupOpen} onAuthenticated={() => qc.resetQueries()} />;
  }

  const value: AuthCtx = {
    user: data.user,
    signOut: async () => {
      await api.logout().catch(() => null);
      qc.clear();
      await qc.fetchQuery({ queryKey: ["auth"], queryFn: api.authStatus });
    },
    signOutEverywhere: async () => {
      await api.logoutAll().catch(() => null);
      qc.clear();
      await qc.fetchQuery({ queryKey: ["auth"], queryFn: api.authStatus });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ─── Sign in / Sign up screen ──────────────────────────────────────────────
function PasswordInput({ id, value, onChange, autoComplete, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={128}
        required
        className="h-10 pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 8) out.push("at least 8 characters");
  if (!/[A-Za-z]/.test(pw)) out.push("a letter");
  if (!/\d/.test(pw)) out.push("a number");
  return out;
}

export function AuthPage({ signupOpen, onAuthenticated }: { signupOpen: boolean; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">(signupOpen ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signupOpen) setMode("signin");
  }, [signupOpen]);

  const isSignup = mode === "signup";
  const problems = isSignup ? passwordProblems(password) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSignup) {
      if (problems.length) return setError(`Password needs ${problems.join(", ")}.`);
      if (password !== confirm) return setError("Passwords don't match.");
    }
    setBusy(true);
    try {
      if (isSignup) await api.signup({ name, email, password });
      else await api.login({ email, password, remember });
      onAuthenticated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="ig-gradient absolute inset-0 opacity-90" />
        <div className="absolute -left-20 top-1/3 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-3 text-white">
          <img src="/favicon.svg" alt="" className="size-11 rounded-xl ring-2 ring-white/40" />
          <div>
            <p className="text-lg font-bold">Instagram Intelligence Agent</p>
            <p className="text-sm text-white/80">Search, Analyze &amp; Track Instagram Profiles</p>
          </div>
        </div>
        <div className="relative space-y-5 text-white">
          {[
            { icon: <Search />, t: "Official Instagram API", d: "Business & Creator profiles via the Instagram Graph API." },
            { icon: <BarChart3 />, t: "Date-wise analytics", d: "Snapshots, charts and search distribution over time." },
            { icon: <CalendarDays />, t: "Tracking calendar", d: "See exactly which profiles were checked on each day." },
            { icon: <ShieldCheck />, t: "Private by design", d: "No scraping, no private profiles, secrets stay on the server." },
          ].map((f) => (
            <div key={f.t} className="flex gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 [&_svg]:size-5">{f.icon}</div>
              <div>
                <p className="font-semibold">{f.t}</p>
                <p className="text-sm text-white/80">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="relative text-xs text-white/70">© {new Date().getFullYear()} Instagram Intelligence Agent</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md p-6 sm:p-8 animate-fade-up">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src="/favicon.svg" alt="" className="size-10" />
            <p className="font-bold">Instagram Intelligence Agent</p>
          </div>

          {signupOpen && (
            <div className="mb-6 grid grid-cols-2 rounded-lg bg-muted/70 p-1" role="tablist" aria-label="Sign in or sign up">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={cn(
                    "cursor-pointer rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors",
                    mode === m && "bg-card-solid text-foreground shadow-sm",
                  )}
                >
                  {m === "signin" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>
          )}

          <h1 className="text-2xl font-bold tracking-tight">{isSignup ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup ? "Create an account to access this dashboard." : "Sign in to access your Instagram analytics dashboard."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {isSignup && (
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium">
                  Full name
                </label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" maxLength={80} required className="h-10" />
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" maxLength={254} required className="h-10" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <PasswordInput
                id="password"
                value={password}
                onChange={setPassword}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "At least 8 characters, with a letter and a number" : "Your password"}
              />
              {isSignup && password && (
                <p className={cn("text-xs", problems.length ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {problems.length ? `Needs ${problems.join(", ")}` : "Strong enough ✓"}
                </p>
              )}
            </div>
            {isSignup && (
              <div className="space-y-1.5">
                <label htmlFor="confirm" className="text-sm font-medium">
                  Confirm password
                </label>
                <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Repeat the password" />
              </div>
            )}
            {!isSignup && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--primary)]" />
                Keep me signed in for 30 days
              </label>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}

            <Button type="submit" variant="gradient" className="h-10 w-full" disabled={busy || !email || !password || (isSignup && !name)}>
              {busy ? <Loader2 className="animate-spin" /> : isSignup ? <UserPlus /> : <LogIn />}
              {isSignup ? "Create account" : "Sign in"}
            </Button>
          </form>

          {!signupOpen && (
            <p className="mt-4 text-center text-xs text-muted-foreground">Need access? Ask the dashboard owner to create an account for you.</p>
          )}

          <p className="mt-6 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            This is your dashboard account — never your Instagram password. This app never asks for Instagram credentials.
          </p>
        </Card>
      </div>
    </div>
  );
}
