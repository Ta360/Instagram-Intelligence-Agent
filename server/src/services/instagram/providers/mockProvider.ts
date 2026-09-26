import { AppError } from "../../../lib/errors.js";
import type { ParsedQuery } from "../../../lib/validation.js";
import {
  PROFILE_FIELDS,
  type ConnectionStatus,
  type InstagramProvider,
  type NormalizedMedia,
  type NormalizedProfile,
  type ProfileField,
  type ProviderResult,
} from "../types.js";

/**
 * MOCK MODE provider — realistic, deterministic DEMO DATA.
 *
 * Every value here is synthetic and tagged "demo". Rows written while this
 * provider is active are stored with dataSource = "mock" and never mix with
 * production analytics.
 *
 * Reserved demo usernames exercise the error states:
 *   private*   → private profile      notfound* / ghost* → not found
 *   ratelimit* → rate limited         noperm*            → permission required
 */

// Public-domain (CC0) sample clips published by MDN for media-player demos.
const SAMPLE_VIDEOS = [
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
];

const NICHES = [
  {
    name: "Travel",
    bio: "Slow travel, big views. Mapping hidden trails one reel at a time.",
    captions: ["Sunrise above the clouds", "Street food crawl, part 3", "Packing light for 30 days", "Hidden waterfall, no crowds"],
  },
  {
    name: "Food",
    bio: "Home cooking, weeknight friendly. New recipe every Tuesday.",
    captions: ["15-minute garlic noodles", "Sourdough, day 4 update", "Market haul & meal plan", "Spice pantry tour"],
  },
  {
    name: "Tech",
    bio: "Desk setups, gadgets and honest reviews. Building in public.",
    captions: ["My 2026 desk setup", "Keyboard sound test", "Is this laptop worth it?", "Cable management in 60s"],
  },
  {
    name: "Fitness",
    bio: "Strength training for busy people. Progress over perfection.",
    captions: ["Full-body in 20 minutes", "Deadlift form check", "What I eat on training days", "Mobility routine"],
  },
  {
    name: "Art",
    bio: "Watercolor & ink. Commissions open. Process videos daily.",
    captions: ["Timelapse: city at dusk", "Palette cleanup ASMR", "Sketchbook flip-through", "Ink wash experiment"],
  },
  {
    name: "Music",
    bio: "Producer / multi-instrumentalist. Loops, gear and late-night sessions.",
    captions: ["Building a beat from scratch", "Synth patch walkthrough", "Live looping session", "Studio tour"],
  },
];

/** FNV-1a 32-bit hash — deterministic seed per username. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seeded(seed: number) {
  let t = seed || 1;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function titleCase(username: string) {
  return username
    .split(/[._]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

const MOCK_PAGE_SIZE = 12;
const MOCK_TOTAL_MEDIA = 36;
const nextDemoCursor = (start: number) => (start + MOCK_PAGE_SIZE < MOCK_TOTAL_MEDIA ? `demo:${start + MOCK_PAGE_SIZE}` : null);

const DAY_MS = 86_400_000;
const EPOCH = Date.UTC(2026, 0, 1);

export class MockInstagramProvider implements InstagramProvider {
  readonly dataSource = "mock" as const;
  readonly name = "Demo data provider (mock mode)";

  constructor(private now: () => number = Date.now) {}

  async fetchProfile(query: ParsedQuery): Promise<ProviderResult> {
    const username = query.kind === "userId" ? `demo.id${query.value.slice(-6)}` : query.value;

    if (/^private/.test(username)) throw new AppError("PRIVATE_PROFILE");
    if (/^(notfound|ghost)/.test(username)) throw new AppError("NOT_FOUND");
    if (/^ratelimit/.test(username)) throw new AppError("RATE_LIMITED", undefined, { retryAfterSeconds: 900 });
    if (/^noperm/.test(username)) throw new AppError("PERMISSION_REQUIRED");

    const seed = hashSeed(username);
    const rand = seeded(seed);
    const niche = NICHES[seed % NICHES.length]!;
    const now = this.now();
    const days = Math.max(0, (now - EPOCH) / DAY_MS);

    // Base audience spans ~800 → ~4.8M on a log scale; grows slowly day over day.
    const base = Math.round(Math.pow(10, 2.9 + rand() * 3.8));
    const dailyGrowth = 0.0008 + rand() * 0.004;
    const hourWave = Math.sin((now / 3_600_000) * 0.9 + seed) * base * 0.0004;
    const followersCount = Math.round(base * (1 + dailyGrowth * days) + hourWave);
    const followingCount = Math.round(80 + rand() * 1400 + Math.floor(days / 20));
    const mediaCount = Math.round(40 + rand() * 900 + Math.floor(days / 3));

    const availability = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, "demo"])) as Record<ProfileField, "demo">;

    const profile: NormalizedProfile = {
      igUserId: query.kind === "userId" ? query.value : `17841${String(seed).padStart(10, "0")}`,
      username,
      displayName: titleCase(username),
      bio: `[DEMO] ${niche.name} creator · ${niche.bio}`,
      profilePictureUrl: `/api/demo-assets/avatar/${encodeURIComponent(username)}.svg`,
      website: rand() > 0.35 ? `https://example.com/${username.replace(/[^a-z0-9]/g, "")}` : null,
      accountType: rand() > 0.5 ? "CREATOR" : "BUSINESS",
      followersCount,
      followingCount,
      mediaCount,
      isVerified: followersCount > 250_000,
      // Demo accounts are not real Instagram accounts, so there is no Instagram URL to open.
      profileUrl: null,
      fieldAvailability: availability,
      unavailableReasons: { profileUrl: "Demo accounts do not exist on Instagram." },
    };

    const media = this.mediaPage(username, 0, followersCount, now);
    return { profile, media, mediaCursor: nextDemoCursor(0) };
  }

  /** Demo pagination mirrors the Graph API: MOCK_PAGE_SIZE items per page, opaque cursor. */
  async fetchMoreMedia(query: ParsedQuery, cursor: string) {
    const start = Number(/^demo:(\d+)$/.exec(cursor)?.[1] ?? NaN);
    if (!Number.isInteger(start) || start < 0 || start >= MOCK_TOTAL_MEDIA) throw new AppError("INVALID_INPUT", "Invalid media cursor.");
    const { profile } = await this.fetchProfile(query);
    return { media: this.mediaPage(profile.username, start, profile.followersCount ?? 1000, this.now()), mediaCursor: nextDemoCursor(start) };
  }

  private mediaPage(username: string, start: number, followersCount: number, now: number): NormalizedMedia[] {
    const seed = hashSeed(username);
    const niche = NICHES[seed % NICHES.length]!;
    const media: NormalizedMedia[] = [];
    for (let i = start; i < Math.min(start + MOCK_PAGE_SIZE, MOCK_TOTAL_MEDIA); i++) {
      const mSeed = hashSeed(`${username}:${i}`);
      const r = seeded(mSeed);
      const isVideo = i % 3 === 0;
      const isCarousel = !isVideo && i % 4 === 1;
      const thumb = `/api/demo-assets/thumb/${mSeed}.svg`;
      // Some reels deliberately have no media URL to demonstrate the fallback state.
      const playable = isVideo && i % 2 === 0;
      const reach = Math.max(10, followersCount * (0.01 + r() * 0.08));
      media.push({
        mediaId: `demo_${seed}_${i}`,
        mediaType: isVideo ? "VIDEO" : isCarousel ? "CAROUSEL_ALBUM" : "IMAGE",
        productType: isVideo ? "REELS" : "FEED",
        thumbnailUrl: thumb,
        mediaUrl: isVideo ? (playable ? SAMPLE_VIDEOS[mSeed % SAMPLE_VIDEOS.length]! : null) : thumb,
        permalink: null,
        caption: `[DEMO] ${niche.captions[i % niche.captions.length]} #${niche.name.toLowerCase()}`,
        likeCount: Math.round(reach),
        commentsCount: Math.round(reach * (0.01 + r() * 0.04)),
        publishedAt: new Date(now - (i * 2 + r()) * DAY_MS - 3_600_000),
      });
    }
    return media;
  }

  async checkConnection(): Promise<ConnectionStatus> {
    return {
      ok: true,
      message: "Mock mode — serving DEMO DATA. No Instagram API calls are made.",
      checkedAt: new Date(this.now()).toISOString(),
    };
  }
}

// ─── Demo image assets (SVG) ───────────────────────────────────────────────
const PALETTES = [
  ["#6366F1", "#EC4899"],
  ["#06B6D4", "#6366F1"],
  ["#F59E0B", "#EF4444"],
  ["#22C55E", "#06B6D4"],
  ["#8B5CF6", "#F472B6"],
  ["#0EA5E9", "#22C55E"],
];

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function demoAvatarSvg(username: string): string {
  const seed = hashSeed(username);
  const [a, b] = PALETTES[seed % PALETTES.length]!;
  const initials = escapeXml(
    titleCase(username)
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "?",
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><text x="80" y="96" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="54" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text><text x="80" y="140" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="600" fill="#ffffffcc" text-anchor="middle" letter-spacing="3">DEMO</text></svg>`;
}

export function demoThumbSvg(seedStr: string): string {
  const seed = Number(seedStr) >>> 0;
  const r = seeded(seed);
  const [a, b] = PALETTES[seed % PALETTES.length]!;
  const circles = Array.from({ length: 5 }, () => {
    const cx = Math.round(r() * 540);
    const cy = Math.round(r() * 960);
    const rad = Math.round(60 + r() * 220);
    return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#ffffff" opacity="${(0.06 + r() * 0.12).toFixed(2)}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 960"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="540" height="960" fill="url(#g)"/>${circles}<text x="270" y="500" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="44" font-weight="700" fill="#ffffffd9" text-anchor="middle" letter-spacing="8">DEMO</text></svg>`;
}
