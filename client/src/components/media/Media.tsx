import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  Heart,
  Images,
  ImageIcon,
  Maximize,
  MessageCircle,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives";
import { ApiUnavailable, DemoBadge, EmptyState, ErrorState } from "@/components/common";
import { useQueryClient } from "@tanstack/react-query";
import { DownloadCloud, Loader2 } from "lucide-react";
import { useMedia, useProfile } from "@/hooks/queries";
import { ApiError, api } from "@/lib/api";
import { instagramEmbedUrl } from "@/lib/instagram";
import type { DataSource, Media } from "@/lib/types";
import { formatCount, formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Video player ──────────────────────────────────────────────────────────
export function VideoPlayer({ media, username, label }: { media: Media; username: string; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const logged = useRef(false);

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setFailed(false);
    logged.current = false;
  }, [media.id]);

  useEffect(() => {
    if (video.current) {
      video.current.volume = volume;
      video.current.muted = muted;
    }
  }, [volume, muted]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setFailed(true));
    else v.pause();
  };

  if (failed || !media.mediaUrl) return <MediaFallback media={media} reason={failed ? "This video could not be played in the dashboard." : undefined} />;

  return (
    <div ref={wrap} className="group relative mx-auto aspect-[9/16] max-h-[70vh] w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={video}
        src={media.mediaUrl}
        poster={media.thumbnailUrl ?? undefined}
        preload="metadata"
        playsInline
        className="size-full object-contain"
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          if (!logged.current) {
            logged.current = true;
            void api.logActivity("play_media", username, label);
          }
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
        aria-label={`${label} video`}
      />
      {!playing && (
        <button onClick={toggle} className="absolute inset-0 grid cursor-pointer place-items-center bg-black/20" aria-label="Play">
          <span className="grid size-16 place-items-center rounded-full bg-white/90 text-black shadow-xl transition-transform hover:scale-105">
            <Play className="ml-1 size-7 fill-current" />
          </span>
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-8 text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={time}
          onChange={(e) => {
            if (video.current) video.current.currentTime = Number(e.target.value);
          }}
          className="h-1 w-full cursor-pointer accent-pink-500"
          aria-label="Seek"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button onClick={toggle} className="cursor-pointer rounded p-1 hover:bg-white/15" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <button onClick={() => setMuted((m) => !m)} className="cursor-pointer rounded p-1 hover:bg-white/15" aria-label={muted ? "Unmute" : "Mute"}>
            {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setMuted(false);
            }}
            className="h-1 w-16 cursor-pointer accent-white"
            aria-label="Volume"
          />
          <span className="ml-1 text-xs tabular-nums">
            {formatDuration(time)} / {formatDuration(duration)}
          </span>
          <button
            onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void wrap.current?.requestFullscreen())}
            className="ml-auto cursor-pointer rounded p-1 hover:bg-white/15"
            aria-label="Fullscreen"
          >
            <Maximize className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Plays a post/reel through Instagram's official embed player inside the dashboard.
 * Used when the API returns no direct media URL (licensed audio, downloads disabled).
 */
export function InstagramEmbed({ media, username, label }: { media: Media; username?: string; label?: string }) {
  const src = instagramEmbedUrl(media.permalink);
  const logged = useRef(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    logged.current = false;
  }, [media.id]);
  if (!src) return <MediaFallback media={media} noEmbed />;
  return (
    <div className="space-y-2">
      <div className="relative mx-auto h-[min(72vh,720px)] w-full max-w-[420px] overflow-hidden rounded-xl border bg-white">
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center bg-muted">
            {media.thumbnailUrl && <img src={media.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover opacity-40" />}
            <Loader2 className="relative size-8 animate-spin text-primary" />
          </div>
        )}
        <iframe
          key={media.id}
          src={src}
          title={label ? `${label} — Instagram embed` : "Instagram embed"}
          className="size-full"
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          onLoad={() => {
            setLoaded(true);
            if (!logged.current && username) {
              logged.current = true;
              void api.logActivity("play_media", username, `${label ?? "Media"} (Instagram embed)`);
            }
          }}
        />
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Playing via Instagram&apos;s official embed player ·{" "}
        <a href={media.permalink!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Open on Instagram
        </a>
      </p>
    </div>
  );
}

/** Last resort: thumbnail + official Instagram link (no direct URL and no embeddable permalink). */
export function MediaFallback({ media, reason, noEmbed = false }: { media: Media; reason?: string; noEmbed?: boolean }) {
  if (!noEmbed && instagramEmbedUrl(media.permalink)) return <InstagramEmbed media={media} />;
  return (
    <div className="relative mx-auto aspect-[9/16] max-h-[70vh] w-full overflow-hidden rounded-xl bg-muted">
      {media.thumbnailUrl ? (
        <img src={media.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover opacity-70" />
      ) : (
        <div className="grid size-full place-items-center text-muted-foreground">
          <Film className="size-10" />
        </div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-4 text-center text-white">
        <p className="text-sm font-medium">{reason ?? "In-app playback isn't available for this media."}</p>
        <p className="text-xs text-white/75">The Instagram API did not provide a playable media URL. View it on Instagram instead.</p>
        {media.permalink ? (
          <Button asChild size="sm" variant="gradient">
            <a href={media.permalink} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open on Instagram
            </a>
          </Button>
        ) : (
          <Badge variant="demo">No Instagram URL (demo media)</Badge>
        )}
      </div>
    </div>
  );
}

function MediaMeta({ media, dataSource }: { media: Media; dataSource?: DataSource }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={media.isReel ? "default" : "secondary"}>{media.isReel ? "Reel" : media.mediaType === "CAROUSEL_ALBUM" ? "Carousel" : "Post"}</Badge>
        <Badge variant={media.playable || (media.mediaType !== "IMAGE" && instagramEmbedUrl(media.permalink)) ? "success" : "outline"}>
          {media.playable ? "Playable in dashboard" : media.mediaType !== "IMAGE" && instagramEmbedUrl(media.permalink) ? "Plays via Instagram embed" : media.mediaType === "VIDEO" ? "Playback unavailable" : "Image"}
        </Badge>
        <DemoBadge dataSource={dataSource} />
      </div>
      {media.caption && <p className="whitespace-pre-line text-muted-foreground">{media.caption}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Published {formatDate(media.publishedAt)}</span>
        <span className="flex items-center gap-1" title={media.likeCount === null ? "Like count hidden or unavailable" : undefined}>
          <Heart className="size-3.5" /> {media.likeCount === null ? "Unavailable" : formatCount(media.likeCount)}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="size-3.5" /> {media.commentsCount === null ? "Unavailable" : formatCount(media.commentsCount)}
        </span>
      </div>
      {media.permalink && (
        <a href={media.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ExternalLink className="size-3.5" /> Official Instagram URL
        </a>
      )}
    </div>
  );
}

// ─── Reel / media viewer ───────────────────────────────────────────────────
export function ReelViewer({ username, dataSource, className }: { username: string; dataSource?: DataSource; className?: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useMedia(username, "reels", page, 12);
  const [index, setIndex] = useState(0);
  const playerRef = useRef<HTMLDivElement>(null);
  const selectReel = (i: number) => {
    setIndex(i);
    // Bring the player into view (important on mobile where it sits above the list).
    const r = playerRef.current?.getBoundingClientRect();
    if (r && (r.top < 64 || r.bottom > window.innerHeight)) playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  useEffect(() => setIndex(0), [username, page]);

  const items = data?.items ?? [];
  const current = items[index];
  const offset = (page - 1) * 12;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Film className="size-4 text-primary" /> Reels / Media Viewer
            </CardTitle>
            <CardDescription>
              Accessible reels for @{username}
              {data ? ` · ${data.total} available` : ""}
            </CardDescription>
          </div>
          <DemoBadge dataSource={dataSource} />
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
            <Skeleton className="aspect-[9/16] w-full" />
            <Skeleton className="h-40" />
          </div>
        ) : !items.length ? (
          <>
            <ApiUnavailable title="No accessible reels yet" description="No reels or videos in the media loaded so far. Load more from Instagram to check older posts." />
            <LoadMoreFromInstagram username={username} />
          </>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,340px)_1fr]">
            <div ref={playerRef} className="scroll-mt-24">
              {current!.playable ? <VideoPlayer media={current!} username={username} label={`Reel ${String(offset + index + 1).padStart(2, "0")}`} /> : <InstagramEmbed media={current!} username={username} label={`Reel ${String(offset + index + 1).padStart(2, "0")}`} />}
            </div>
            <div className="min-w-0 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Reel {String(offset + index + 1).padStart(2, "0")}</p>
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label="Previous reel">
                    <ChevronLeft />
                  </Button>
                  <Button size="icon-sm" variant="outline" disabled={index >= items.length - 1} onClick={() => setIndex((i) => i + 1)} aria-label="Next reel">
                    <ChevronRight />
                  </Button>
                </div>
              </div>
              <MediaMeta media={current!} dataSource={dataSource} />
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select a reel</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {items.map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => selectReel(i)}
                      className={cn("group relative aspect-[9/16] cursor-pointer overflow-hidden rounded-lg border-2 border-transparent bg-muted", i === index && "border-primary")}
                      aria-label={`Reel ${String(offset + i + 1).padStart(2, "0")}${m.playable || instagramEmbedUrl(m.permalink) ? " — play" : " (open on Instagram)"}`}
                    >
                      {m.thumbnailUrl && <img src={m.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover transition-transform group-hover:scale-105" />}
                      <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">{String(offset + i + 1).padStart(2, "0")}</span>
                      <span className="absolute bottom-1 right-1 rounded-full bg-black/60 p-1 text-white">
                        {m.playable || instagramEmbedUrl(m.permalink) ? <Play className="size-3 fill-current" /> : <ExternalLink className="size-3" />}
                      </span>
                    </button>
                  ))}
                </div>
                {data.totalPages > 1 && <Pager page={page} totalPages={data.totalPages} onChange={setPage} />}
                <LoadMoreFromInstagram username={username} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Fetches the next page of the account's media from Instagram (official cursor
 * pagination). Each click is one API call, so it's user-driven, not automatic.
 */
export function LoadMoreFromInstagram({ username, className }: { username: string; className?: string }) {
  const qc = useQueryClient();
  const { data } = useProfile(username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!data?.profile.hasMoreMedia && !note) return null;

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.loadMoreMedia(username);
      setNote(r.hasMoreMedia ? `Loaded ${r.added} more · ${r.totalStored} stored` : `All accessible media loaded · ${r.totalStored} items`);
      await Promise.all(["media", "profile", "summary"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("INTERNAL", "Could not load more media.", 500));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed p-3 text-center", className)}>
      {data?.profile.hasMoreMedia ? (
        <>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <DownloadCloud />} Load more from Instagram
          </Button>
          <p className="text-[11px] text-muted-foreground">Fetches the next page of posts &amp; reels via the official API (1 API call).</p>
        </>
      ) : null}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {error && <ErrorState error={error} className="w-full text-left" />}
    </div>
  );
}

export function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft /> Prev
      </Button>
      <span>
        Page {page} of {totalPages}
      </span>
      <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next <ChevronRight />
      </Button>
    </div>
  );
}

// ─── Posts grid ────────────────────────────────────────────────────────────
export function MediaGrid({ username, type, dataSource }: { username: string; type: "all" | "posts" | "reels"; dataSource?: DataSource }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useMedia(username, type, page, 12);
  const [open, setOpen] = useState<Media | null>(null);
  useEffect(() => setPage(1), [username, type]);

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data)
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    );
  if (!data.items.length)
    return (
      <>
        <EmptyState icon={<ImageIcon />} title="No accessible media" description="No media of this type in what has been loaded so far." />
        <LoadMoreFromInstagram username={username} />
      </>
    );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.items.map((m) => (
          <button key={m.id} onClick={() => setOpen(m)} className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-muted text-left">
            {m.thumbnailUrl ? (
              <img src={m.thumbnailUrl} alt={m.caption ?? "Instagram media"} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <div className="grid size-full place-items-center text-muted-foreground">
                <ImageIcon />
              </div>
            )}
            <span className="absolute right-2 top-2 rounded-full bg-black/55 p-1 text-white [&_svg]:size-3.5">
              {m.isReel ? <Film /> : m.mediaType === "CAROUSEL_ALBUM" ? <Images /> : <ImageIcon />}
            </span>
            <div className="absolute inset-x-0 bottom-0 flex gap-3 bg-gradient-to-t from-black/75 to-transparent px-2.5 pb-2 pt-6 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex items-center gap-1">
                <Heart className="size-3.5" /> {m.likeCount === null ? "—" : formatCount(m.likeCount)}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="size-3.5" /> {m.commentsCount === null ? "—" : formatCount(m.commentsCount)}
              </span>
            </div>
          </button>
        ))}
      </div>
      {data.totalPages > 1 && <Pager page={page} totalPages={data.totalPages} onChange={setPage} />}
                <LoadMoreFromInstagram username={username} />

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label="Media details">
          <div className="grid max-h-[92vh] w-full max-w-4xl gap-5 overflow-auto rounded-2xl bg-card-solid p-4 md:grid-cols-[minmax(0,360px)_1fr]" onClick={(e) => e.stopPropagation()}>
            {open.playable ? (
              <VideoPlayer media={open} username={username} label="Media" />
            ) : open.mediaType === "VIDEO" || (open.mediaType === "CAROUSEL_ALBUM" && instagramEmbedUrl(open.permalink)) ? (
              <InstagramEmbed media={open} username={username} label={open.isReel ? "Reel" : "Post"} />
            ) : (
              <img src={open.mediaUrl ?? open.thumbnailUrl ?? ""} alt={open.caption ?? ""} referrerPolicy="no-referrer" className="w-full rounded-xl object-contain" />
            )}
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
                  Close
                </Button>
              </div>
              <MediaMeta media={open} dataSource={dataSource} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
