import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecentSearches } from "@/hooks/queries";
import { STAGE_LABEL, isBusy, useAppState, useDebounced } from "@/hooks/appState";
import { relativeTime } from "@/lib/format";
import { validateInstagramQuery } from "@/lib/validation";
import { cn } from "@/lib/utils";

/** Large top search bar with validation, loading stages and a recent-searches dropdown. */
export function SearchBar({ className }: { className?: string }) {
  const { runSearch, stage } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [hint, setHint] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = isBusy(stage);

  const q = useDebounced(value.trim().replace(/^@/, "").toLowerCase(), 200);
  const { data: recent } = useRecentSearches(q);
  const items = recent?.items ?? [];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function submit(query: string) {
    const v = validateInstagramQuery(query);
    if (!v.ok) {
      setHint(v.error);
      return;
    }
    setHint(null);
    setOpen(false);
    setValue(v.kind === "username" ? `@${v.value}` : v.value);
    const result = await runSearch(query);
    // Stay on the dashboard (it shows the selected profile); elsewhere open the in-app profile viewer.
    if (result && location.pathname !== "/") navigate(`/profile/${result.profile.username}`);
    if (!result && location.pathname !== "/" && location.pathname !== "/search") navigate("/search");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (active >= 0 && items[active]) return void submit(items[active]!.username);
    void submit(value);
  }

  return (
    <div ref={wrapRef} className={cn("relative w-full min-w-0", className)}>
      <form onSubmit={onSubmit} role="search" className="glass flex h-12 items-center gap-2 rounded-xl pl-3 pr-1.5 shadow-lg shadow-black/5 focus-within:ring-2 focus-within:ring-ring/50">
        {busy ? <Loader2 className="size-5 shrink-0 animate-spin text-primary" /> : <Search className="size-5 shrink-0 text-muted-foreground" />}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setHint(null);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search Instagram username or User ID..."
          aria-label="Search Instagram username or User ID"
          aria-autocomplete="list"
          aria-expanded={open && items.length > 0}
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {busy && <span className="hidden text-xs text-muted-foreground md:inline">{STAGE_LABEL[stage]}</span>}
        {value && !busy && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setHint(null);
              inputRef.current?.focus();
            }}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
        <Button type="submit" variant="gradient" disabled={busy} className="h-9 px-4">
          {busy ? <Loader2 className="animate-spin" /> : <Search />}
          <span className="hidden sm:inline">Search</span>
        </Button>
      </form>

      {hint && <p className="mt-1.5 px-1 text-xs text-red-500">{hint}</p>}

      {open && !busy && items.length > 0 && (
        <div role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl border bg-popover shadow-xl animate-fade-up">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent searches</p>
          {items.map((r, i) => (
            <button
              key={r.username}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void submit(r.username)}
              className={cn("flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent", i === active && "bg-accent")}
            >
              <Clock className="size-4 text-muted-foreground" />
              <span className="font-medium">@{r.username}</span>
              {r.profileName && <span className="truncate text-muted-foreground">{r.profileName}</span>}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{relativeTime(r.searchedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
