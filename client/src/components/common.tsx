import { useState, type ReactNode } from "react";
import { AlertTriangle, Ban, CloudOff, FileQuestion, KeyRound, Lock, SearchX, ShieldAlert, Timer } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api";
import type { DataSource, FieldAvailability, SearchStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DemoBadge({ dataSource, className }: { dataSource?: DataSource | null; className?: string }) {
  if (dataSource !== "mock") return null;
  return (
    <Badge variant="demo" className={className} title="Mock mode: synthetic sample data, not real Instagram data">
      DEMO DATA
    </Badge>
  );
}

const AVAIL: Record<FieldAvailability, { label: string; variant: "success" | "info" | "outline" | "demo" }> = {
  public: { label: "Public", variant: "info" },
  authorized_api: { label: "Authorized API", variant: "success" },
  unavailable: { label: "Unavailable", variant: "outline" },
  demo: { label: "Demo", variant: "demo" },
};

export function AvailabilityBadge({ value, reason }: { value?: FieldAvailability; reason?: string }) {
  if (!value) return null;
  const a = AVAIL[value];
  return (
    <Badge variant={a.variant} title={reason ?? a.label} className="text-[10px]">
      {a.label}
    </Badge>
  );
}

const STATUS_VARIANT: Record<SearchStatus, "success" | "warning" | "danger" | "outline" | "info"> = {
  SUCCESS: "success",
  NOT_FOUND: "outline",
  PRIVATE: "warning",
  PERMISSION_REQUIRED: "warning",
  RATE_LIMITED: "danger",
  NETWORK_ERROR: "danger",
  INVALID_INPUT: "outline",
};
export function StatusBadge({ status }: { status: SearchStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center", className)}>
      <div className="mb-1 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon ?? <FileQuestion />}</div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const ERROR_META: Record<string, { title: string; icon: ReactNode; tone: string }> = {
  NOT_FOUND: { title: "Profile Not Found", icon: <SearchX />, tone: "text-muted-foreground" },
  PRIVATE_PROFILE: { title: "Private Profile", icon: <Lock />, tone: "text-amber-500" },
  PERMISSION_REQUIRED: { title: "API Permission Required", icon: <KeyRound />, tone: "text-amber-500" },
  API_NOT_CONFIGURED: { title: "Instagram API Not Configured", icon: <ShieldAlert />, tone: "text-amber-500" },
  RATE_LIMITED: { title: "Rate Limit Reached", icon: <Timer />, tone: "text-red-500" },
  NETWORK_ERROR: { title: "Network Error", icon: <CloudOff />, tone: "text-red-500" },
  INVALID_INPUT: { title: "Invalid Input", icon: <Ban />, tone: "text-muted-foreground" },
};

export function ErrorState({ error, onRetry, className }: { error: ApiError | Error; onRetry?: () => void; className?: string }) {
  const code = (error as ApiError).code ?? "INTERNAL";
  const meta = ERROR_META[code] ?? { title: "Something went wrong", icon: <AlertTriangle />, tone: "text-red-500" };
  const retry = (error as ApiError).retryAfterSeconds;
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-lg border bg-card p-4", className)}>
      <div className={cn("mt-0.5 [&_svg]:size-5", meta.tone)}>{meta.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{meta.title}</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        {retry ? <p className="mt-1 text-xs text-muted-foreground">Try again in about {Math.ceil(retry / 60)} min.</p> : null}
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Shown where the official API does not provide a capability — never a workaround. */
export function ApiUnavailable({ title, description, className }: { title: string; description: string; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-4", className)}>
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function ProfileAvatar({ src, username, size = 48, ring = false, className }: { src?: string | null; username: string; size?: number; ring?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = username.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  const img =
    src && !failed ? (
      <img
        src={src}
        alt={`@${username}`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-full rounded-full object-cover"
      />
    ) : (
      <div className="grid size-full place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">{initials}</div>
    );
  return (
    <div className={cn("shrink-0", ring && "ig-ring", className)} style={{ width: size, height: size }}>
      <div className={cn("size-full rounded-full", ring && "bg-background p-[2px]")}>{img}</div>
    </div>
  );
}

export function SectionTitle({ icon, title, description, right }: { icon?: ReactNode; title: string; description?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight [&_svg]:size-5 [&_svg]:text-primary">
          {icon}
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ title, description, right }: { title: string; description?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {right}
    </div>
  );
}
