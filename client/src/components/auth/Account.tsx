import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2, LogOut, MonitorSmartphone, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { passwordProblems, useAuth } from "./Auth";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Header avatar with the signed-in account and sign-out actions. */
export function UserMenu() {
  const { user, signOut, signOutEverywhere } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="ig-gradient grid size-9 cursor-pointer place-items-center rounded-full text-sm font-bold text-white ring-2 ring-background transition hover:brightness-110"
      >
        {initialsOf(user.name)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border bg-popover shadow-xl animate-fade-up">
          <div className="border-b p-3">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="p-1">
            <Link
              role="menuitem"
              to="/settings#account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <Settings className="size-4" /> Account settings
            </Link>
            <button
              role="menuitem"
              disabled={busy}
              onClick={() => void run(signOut)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} Sign out
            </button>
            <button
              role="menuitem"
              disabled={busy}
              onClick={() => void run(signOutEverywhere)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
            >
              <MonitorSmartphone className="size-4" /> Sign out of all devices
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Account details + change password (Settings page). */
export function AccountCard() {
  const { user, signOutEverywhere } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const problems = passwordProblems(next);

  useEffect(() => {
    if (window.location.hash === "#account") document.getElementById("account")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (problems.length) return setMsg({ ok: false, text: `New password needs ${problems.join(", ")}.` });
    if (next !== confirm) return setMsg({ ok: false, text: "New passwords don't match." });
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ ok: true, text: "Password changed. Other devices have been signed out." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not change password." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="account" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-primary" /> Account
        </CardTitle>
        <CardDescription>Your dashboard sign-in. This is separate from Instagram — the app never asks for your Instagram password.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3 border-b py-2">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{user.name}</span>
          </div>
          <div className="flex justify-between gap-3 border-b py-2">
            <span className="text-muted-foreground">Email</span>
            <span className="truncate font-medium">{user.email}</span>
          </div>
          <div className="flex justify-between gap-3 border-b py-2">
            <span className="text-muted-foreground">Member since</span>
            <span>{formatDateTime(user.createdAt)}</span>
          </div>
          <div className="flex justify-between gap-3 py-2">
            <span className="text-muted-foreground">Last sign-in</span>
            <span>{formatDateTime(user.lastLoginAt)}</span>
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void signOutEverywhere()}>
            <MonitorSmartphone /> Sign out of all devices
          </Button>
        </div>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <p className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4 text-primary" /> Change password
          </p>
          <Input type="password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Current password" />
          <Input type="password" placeholder="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-label="New password" />
          <Input type="password" placeholder="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm new password" />
          {next && (
            <p className={cn("text-xs", problems.length ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
              {problems.length ? `Needs ${problems.join(", ")}` : "Strong enough ✓"}
            </p>
          )}
          {msg && (
            <p role="status" className={cn("text-sm", msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {msg.text}
            </p>
          )}
          <Button type="submit" size="sm" disabled={busy || !current || !next || !confirm}>
            {busy && <Loader2 className="animate-spin" />} Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
