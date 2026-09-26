# Instagram Intelligence Agent

**Search, Analyze & Track Instagram Profiles** — a full-stack AI-agent dashboard that looks up Instagram profiles through **official, authorized Instagram/Meta APIs**, shows profiles and accessible media inside the dashboard, and keeps a date-wise analytics history of every search.

> **Compliance by design.** This app only uses the official Instagram Graph API. It never scrapes, never bypasses login, privacy settings, CAPTCHAs or rate limits, never accesses private profiles, never stores or asks for Instagram passwords, and never fabricates data. Anything the official API does not provide is shown as **"API access required / unavailable"** instead of being worked around.

---

## 1. Project overview

| | |
|---|---|
| **Frontend** | React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui components (Radix) · Recharts · TanStack React Query · React Router |
| **Backend** | Node.js · TypeScript · Express 5 · Zod validation · Helmet · express-rate-limit |
| **Database** | PostgreSQL via Prisma ORM (a real local PostgreSQL 17 starts automatically in development) |
| **Instagram** | Instagram Graph API — Business Discovery (production) or realistic **DEMO DATA** (mock mode) |
| **AI Assistant** | OpenAI function calling over backend tools, with a deterministic built-in command engine as fallback |

Ports in development: **client http://localhost:5373**, **API http://localhost:4200**, **PostgreSQL localhost:5433**.

## 2. Features

- **Top search bar** — username, `@username`, profile URL, or numeric User ID, with validation, a clear button, a loading animation, and a recent-searches dropdown (debounced, keyboard navigable, `/` to focus).
- **Staged loading** reflecting the real requests: *Searching Instagram… → Fetching profile information… → Loading available media… → Updating analytics…*, with skeleton loaders throughout.
- **Profile card** — picture, username, name, bio, verified/account type (when available), website, followers/following/posts, profile URL, last checked, data source, API status, and a per-field availability panel (*Public / Authorized API / Unavailable / Demo*).
- **In-app profile viewer** with tabs: Profile Overview · Posts · Reels / Video · Analytics · Search History · Activity Timeline.
- **Reel & media viewer** — custom video player (play/pause, volume, seek/progress, fullscreen, duration) for media the API returns with a playable URL; otherwise thumbnail + **Open on Instagram** (official permalink).
- **All accessible posts & reels** — the first lookup loads the latest page; **Load more from Instagram** walks the official API's cursor pagination page by page (one API call each, within the call budget) until every accessible item is stored.
- **Analytics snapshots** — every search appends a snapshot (followers, following, media, reels, accessible media). Nothing is overwritten, so history is date-wise.
- **Bar chart** "Instagram Profile Daily Activity" — Today / 7 / 30 / 90 days / custom range; metrics: Search Count, Followers Snapshot, Following Snapshot, Media Count, Reel Count, Profile Checks. Days without a snapshot are left empty rather than filled in.
- **Donut chart** "Profile Search Distribution" with date filtering and exact percentages (largest-remainder, always sums to 100%).
- **Centralized hex chart colors** (`client/src/theme/chartTheme.tsx`), editable in **Chart Color Settings**, applied instantly and persisted in the `chart_settings` table.
- **Instagram Tracking Calendar** with intensity indicators; clicking a date shows total searches, profiles checked, usernames and the snapshots captured that day.
- **Profile Historical Tracking** table (Date · Followers · Following · Media · Reels · Searches) with day-over-day follower deltas, from stored values only.
- **Live Tracking** toggle with Manual / 5 / 15 / 30 / 60-minute intervals. Only intervals the API configuration allows are enabled, the server enforces a minimum interval, polling pauses in hidden tabs, and the panel shows *Last updated* and *Next refresh* countdowns.
- **Search history** table with username/status/date filters, pagination and **Export CSV** (formula-injection safe).
- **Saved profiles** (Quick View / Remove) and an **Activity Timeline** built from real database events (searches, views, reel plays, saves, refreshes, exports).
- **AI Assistant** that understands commands like *"Search @exampleuser"*, *"Show today's searches"*, *"Show my most searched profiles this week"*, *"Show profile activity for September 2026"*. It calls backend tools and shows the tool trace plus deep-link actions.
- **Summary cards**: Total Searches · Profiles Tracked · Searches Today · Videos/Reels Available · Last Search.
- **System Status & API Settings** pages: connection, database, AI engine, rate-limit budget, and a capability matrix (supported / limited / unavailable).
- Dark/light theme, glassmorphism, responsive layout (sidebar on desktop, drawer on mobile), empty/error states for every panel.

## 3. Architecture

```
Instagram Intelligence Agent/
├── client/                      React + Vite app (port 5373, proxies /api → 4200)
│   └── src/
│       ├── components/          layout, charts, profile, media, panels, assistant, ui (shadcn)
│       ├── hooks/               React Query hooks, app state (staged search), live tracking
│       ├── lib/                 api client, types, chart transforms, validation, formatting
│       ├── theme/               centralized chart colors + dark/light theme
│       └── pages/               Dashboard, Search, Profile, Analytics, Media, History, Calendar, …
├── server/
│   ├── prisma/schema.prisma     PostgreSQL schema
│   ├── scripts/localPostgres.ts starts a local PostgreSQL for development
│   ├── src/
│   │   ├── config/env.ts        validated environment (secrets stay here)
│   │   ├── middleware/          auth, rate limits, request logging, error sanitization
│   │   ├── routes/index.ts      REST API
│   │   └── services/
│   │       ├── instagram/       ← API abstraction layer
│   │       │   ├── instagramClient.ts            provider factory (mock | Graph API)
│   │       │   ├── providers/graphApiProvider.ts Instagram Graph API (Business Discovery)
│   │       │   ├── providers/mockProvider.ts     DEMO DATA provider
│   │       │   ├── instagramProfileService.ts    search → persist profile/media/snapshot/event
│   │       │   ├── instagramMediaService.ts      media listing & pagination
│   │       │   ├── instagramAnalyticsService.ts  daily, distribution, calendar, history
│   │       │   ├── analyticsTransforms.ts        pure, unit-tested transformations
│   │       │   └── callBudget.ts                 outbound rate-limit budget + cooldown
│   │       ├── ai/                               assistant tools, OpenAI loop, local parser
│   │       └── …                                 history, saved profiles, settings, activity, system
│   └── tests/                   unit + Graph-provider + full API integration tests
└── Dockerfile
```

**Request flow for a search:** client validates → `POST /api/search` → server re-validates → provider (`mock` or Graph API) via cache and call budget → transaction upserts profile and media and appends a snapshot → search event and activity event stored → response → client loads media → React Query invalidates analytics → charts, calendar, cards and timeline refresh without a page reload.

Swapping Instagram providers only requires implementing the `InstagramProvider` interface (`services/instagram/types.ts`). The frontend and analytics never change.

## 4. Tech stack

React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, shadcn/ui (Radix primitives + CVA), lucide-react, Recharts 3, TanStack Query 5, React Router 7 · Node 20+, Express 5, Zod 4, Helmet, express-rate-limit · PostgreSQL 17, Prisma 6 · Vitest, Supertest, Testing Library.

## 5. Installation

Requirements: **Node.js 20+** and npm. PostgreSQL does **not** need to be installed for development.

```bash
cd "Instagram Intelligence Agent"
npm install                      # installs both workspaces; generates the Prisma client
cp server/.env.example server/.env
npm run dev                      # PostgreSQL (5433) + API (4200) + client (5373)
```

Open **http://localhost:5373**. On first run the local database is initialised in `server/.data/postgres` and the schema is applied automatically.

> With npm 11+, approve install scripts once if prompted: `npm approve-scripts @prisma/client prisma @prisma/engines esbuild @embedded-postgres/windows-x64` (use the package for your OS).

## 6. Environment variables (`server/.env`)

| Variable | Purpose |
|---|---|
| `API_PORT` / `PORT` | API port (`API_PORT` wins; hosts that only set `PORT` still work). Default 4200 |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `DATABASE_URL` | PostgreSQL connection string |
| `INSTAGRAM_API_MODE` | `mock` (DEMO DATA) or `production` (Graph API) |
| `INSTAGRAM_ACCESS_TOKEN` | Long-lived token for the Facebook Page linked to your IG Business/Creator account |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Numeric Instagram User ID of **your** Business/Creator account |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Meta app credentials; the secret signs requests (`appsecret_proof`) server-side |
| `INSTAGRAM_GRAPH_API_VERSION` | e.g. `v26.0` |
| `INSTAGRAM_MEDIA_LIMIT` | Media items requested per lookup (default 24) |
| `INSTAGRAM_MAX_CALLS_PER_HOUR` | Local outbound call budget (default 150) |
| `PROFILE_CACHE_TTL_SECONDS` | Profile response cache (default 300) |
| `MIN_REFRESH_INTERVAL_MINUTES` | Minimum live-tracking interval in production (default 15) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Optional; enables LLM function calling (default `gpt-4o-mini`) |
| `DASHBOARD_PASSWORD` / `SESSION_SECRET` | Optional dashboard login (HttpOnly signed cookie) |

Secrets are read only by the server. The browser receives booleans ("configured / not configured"), never values.

## 7. Instagram / Meta API setup (production mode)

The app uses the **Instagram Graph API → Business Discovery** endpoint, the official way to read public data of *other* Business and Creator accounts.

1. Convert your Instagram account to a **Business** or **Creator** account and link it to a **Facebook Page**.
2. Create an app at **developers.facebook.com** and add the *Instagram Graph API* product.
3. Generate a user access token with `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`, `pages_show_list` and `business_management` (Business Discovery requires `instagram_manage_insights`; if your Page role comes from Business Manager, also `ads_read`) (via Graph API Explorer or your login flow), then exchange it for a **long-lived** token.
4. Find your Instagram Business Account ID: `GET /me/accounts` → page id → `GET /{page-id}?fields=instagram_business_account`.
5. Fill `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, set `INSTAGRAM_API_MODE=production`, and restart.
6. Check **System Status**: it should show 🟢 Connected with your account username.

**What the official API provides vs. not**

| Available (Business/Creator accounts) | Not available — shown as a limitation |
|---|---|
| username, name, biography, website, profile picture | personal (non-business) accounts |
| followers, follows, media count | private profiles |
| recent media: type, caption, permalink, timestamp, media/thumbnail URL, like & comment counts (unless hidden) | verified badge, account type (not in Business Discovery) |
| | stories, followers lists, DMs of other accounts |
| | lookup of *other* accounts by numeric User ID (by username only) |

Media URLs from Instagram's CDN are signed and expire; re-searching refreshes them. If a video has no `media_url`, the viewer shows its thumbnail and an **Open on Instagram** button.

## 8. Database setup

The schema is in `server/prisma/schema.prisma`. Tables: `users`, `instagram_profiles`, `profile_snapshots` (append-only), `search_events`, `media_items`, `saved_profiles`, `chart_settings`, `activity_events`. Indexes cover every date-range query (`data_source, searched_at`, `profile_id, captured_at`, …).

- **Development:** automatic (`npm run dev` → `server/scripts/localPostgres.ts`).
- **Your own PostgreSQL:** set `DATABASE_URL`, then `npm run db:push`. The local launcher does nothing when the URL is not localhost.

## 9. Development mode

```bash
npm run dev          # everything
npm run dev:server   # API only (tsx watch)
npm run dev:client   # client only (Vite)
npm test             # server (unit + integration on a throwaway PostgreSQL) and client tests
npm run typecheck    # both workspaces
npm run build        # prisma generate + server tsc + client vite build
```

## 10. Mock mode (`INSTAGRAM_API_MODE=mock`, default)

- Any valid username returns deterministic, realistic **synthetic** data (avatars, thumbnails, captions, counts that drift slowly day to day so history tracking can be demonstrated). Some reels are playable (public-domain MDN sample clip) and some deliberately are not, to show the fallback.
- Everything is labeled **DEMO DATA**, and demo accounts have no Instagram URL.
- Reserved usernames exercise the error states: `private_demo`, `notfound_demo`, `ratelimit_demo`, `noperm_demo`.
- **No mixing:** every row carries `data_source` (`mock` / `production`) and every query filters by the active mode. Switching modes shows a separate analytics history.

## 11. Production mode (`INSTAGRAM_API_MODE=production`)

Uses the Graph API provider. If credentials are missing, the app **does not** fall back to demo data: it reports *Not Connected* and searches return "Instagram API credentials are not configured". Rate limiting is layered: a local hourly call budget, a 15-minute cooldown when Meta reports throttling (error codes 4/17/32/613/800xx), a response cache, a per-profile minimum refresh interval, and restricted live-tracking intervals.

## 12. API endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/search` | `{ query }` → validate, look up, store profile/media/snapshot/event |
| GET | `/api/instagram/profiles` | Profiles searched in the current mode |
| GET | `/api/instagram/profile/:username` | Stored profile (no API call) |
| GET | `/api/instagram/profile/:username/snapshot` | Latest snapshot |
| GET | `/api/instagram/profile/:username/history` | Date-wise history (`?from&to&tz`) |
| GET | `/api/instagram/profile/:username/media` | Media (`?type=all\|posts\|reels&page&pageSize`) |
| POST | `/api/instagram/profile/:username/media/more` | Next page of posts & reels via official cursor pagination (1 API call) |
| POST | `/api/instagram/profile/:username/refresh` | Live/manual refresh (`{ trigger }`), interval-limited |
| GET | `/api/analytics/summary` | Summary cards |
| GET | `/api/analytics/daily` | `?metric&range=today\|7d\|30d\|90d\|custom&from&to&username&tz` |
| GET | `/api/analytics/search-distribution` | Donut data for a range |
| GET | `/api/analytics/date/:date` | Everything recorded on a date |
| GET | `/api/calendar` | `?month=YYYY-MM` per-day counts |
| GET | `/api/search-history` | Filters `username, status, from, to`, pagination |
| GET | `/api/search-history/export.csv` | CSV export with the same filters |
| GET | `/api/search-history/recent` | Recent-search suggestions |
| GET / POST | `/api/saved-profiles` | List / save `{ username }` |
| DELETE | `/api/saved-profiles/:id` | Remove |
| GET / POST | `/api/activity` | Timeline / record `view_profile`, `play_media`, `export_csv` |
| GET / PUT | `/api/settings/chart-colors` | Read / update hex colors (validated `#RRGGBB`) |
| POST | `/api/settings/chart-colors/reset` | Restore defaults |
| POST | `/api/assistant/chat` | `{ message, history? }` → tool-calling assistant |
| GET | `/api/system/status` | Mode, connection, DB, AI, rate budget, capabilities |
| GET / POST | `/api/auth/status`, `/api/auth/login`, `/api/auth/logout` | Optional dashboard auth |

All date endpoints accept `tz` (IANA, e.g. `Asia/Kolkata`) so days are bucketed in the viewer's timezone. Errors are always `{ error: { code, message } }` with user-safe messages.

## 13. Security

- Secrets only in `server/.env`; never bundled into the client. The Graph token is sent in the `Authorization` header (not the URL) and requests are signed with `appsecret_proof`.
- Zod/regex validation of every input (usernames are also regex-checked before being placed in Graph field expansions).
- Rate limits: 300 req/min per IP globally, 30/min for search/refresh, 20/min for the assistant, 10 per 15 min for login.
- Helmet with a strict CSP, CORS allow-list, 64 KB JSON limit, `x-powered-by` disabled.
- Request logging records method, path, status and duration only, with automatic credential redaction.
- Error sanitization: upstream errors are mapped to fixed messages; stack traces never reach the client.
- Optional dashboard password with a timing-safe compare and an HMAC-signed HttpOnly `SameSite=Strict` cookie. The login page states clearly that it is **not** an Instagram password.

## 14. Deployment

**Docker (single container: API + built client):**

```bash
docker build -t instagram-intel .
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/instagram_intel \
  -e INSTAGRAM_API_MODE=production -e INSTAGRAM_ACCESS_TOKEN=... -e INSTAGRAM_BUSINESS_ACCOUNT_ID=... \
  -e INSTAGRAM_APP_SECRET=... -e CORS_ORIGINS=https://your.domain -e SESSION_SECRET=... -e DASHBOARD_PASSWORD=... \
  instagram-intel
```

The container applies the schema (`prisma db push`) and starts the API, which also serves `client/dist`. Any container host works (Azure Container Apps, Render, Fly.io, Cloud Run) with a managed PostgreSQL. Always set `DASHBOARD_PASSWORD` for internet-facing deployments.

**Without Docker:** `npm ci && npm run build`, set env vars, run `npm run db:push`, then `npm start`.

## 15. Troubleshooting

| Symptom | Fix |
|---|---|
| `EPERM … query_engine-windows.dll.node` during build | The dev server is holding Prisma's engine; stop `npm run dev`, then build. |
| `Database unreachable` on System Status | Make sure `npm run dev` (or `npm run db:local`) is running, or `DATABASE_URL` points to a live PostgreSQL. |
| Local PostgreSQL won't start | Delete `server/.data/postgres` (this wipes local data) and restart; check nothing else uses port 5433. |
| 🔴 Not Connected in production | Token expired/invalid (code 190) or missing permissions; regenerate a long-lived token. |
| "Profile could not be found" for a real account | Business Discovery only returns **Business/Creator** accounts; personal/private accounts are intentionally unavailable. |
| Rate limit reached | Wait for the cooldown shown on API Settings; lower live-tracking frequency or `INSTAGRAM_MEDIA_LIMIT`. |
| Reel shows "Open on Instagram" | The API did not return a playable `media_url` for it; this is expected. |
| Assistant says "built-in command engine" | `OPENAI_API_KEY` is not set; the local engine still answers with real data. |
| Dev server port conflict | Change `API_PORT` in `server/.env` and the proxy target in `client/vite.config.ts`. |
