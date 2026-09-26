import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { CallBudget } from "../src/services/instagram/callBudget.js";
import { setInstagramProvider } from "../src/services/instagram/instagramClient.js";
import { clearProfileCache } from "../src/services/instagram/instagramProfileService.js";
import { GraphApiInstagramProvider } from "../src/services/instagram/providers/graphApiProvider.js";
import { MockInstagramProvider } from "../src/services/instagram/providers/mockProvider.js";
import { GRAPH_OK } from "./fixtures.js";

const app = createApp();
const TZ = "UTC";

async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE activity_events, saved_profiles, media_items, search_events, profile_snapshots, instagram_profiles, chart_settings RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  setInstagramProvider(new MockInstagramProvider());
  clearProfileCache();
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const search = (query: string) => request(app).post("/api/search").send({ query });

describe("POST /api/search (mock mode)", () => {
  it("returns a profile with demo-labelled fields and media, and stores event + snapshot", async () => {
    const res = await search("@Example.User");
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe("mock");
    expect(res.body.profile.username).toBe("example.user");
    expect(res.body.profile.fieldAvailability.followersCount).toBe("demo");
    expect(res.body.profile.profileUrl).toBeNull();
    expect(res.body.media.length).toBeGreaterThan(0);
    expect(res.body.media.some((m: { playable: boolean }) => m.playable)).toBe(true);
    expect(res.body.media.some((m: { isReel: boolean; playable: boolean }) => m.isReel && !m.playable)).toBe(true);
    expect(res.body.snapshotCreated).toBe(true);

    const events = await prisma.searchEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "SUCCESS", searchedUsername: "example.user", dataSource: "mock" });
    expect(events[0]!.followersSnapshot).toBe(res.body.profile.followersCount);
    expect(await prisma.profileSnapshot.count()).toBe(1);
    expect(await prisma.activityEvent.count({ where: { type: "search" } })).toBe(1);
  });

  it("appends snapshots instead of overwriting, and does not duplicate snapshots for cached responses", async () => {
    await search("tracker");
    await search("tracker"); // served from cache → event yes, snapshot no
    expect(await prisma.searchEvent.count()).toBe(2);
    expect(await prisma.profileSnapshot.count()).toBe(1);

    clearProfileCache();
    await search("tracker");
    expect(await prisma.profileSnapshot.count()).toBe(2);
    expect(await prisma.instagramProfile.count()).toBe(1);
  });

  it("rejects invalid usernames with 400 and records nothing", async () => {
    const res = await search("bad user!");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
    expect(await prisma.searchEvent.count()).toBe(0);
  });

  it.each([
    ["private_demo", 403, "PRIVATE_PROFILE", "PRIVATE"],
    ["notfound_demo", 404, "NOT_FOUND", "NOT_FOUND"],
    ["ratelimit_demo", 429, "RATE_LIMITED", "RATE_LIMITED"],
    ["noperm_demo", 403, "PERMISSION_REQUIRED", "PERMISSION_REQUIRED"],
  ])("handles %s with a clear error and records the failed search", async (u, http, code, status) => {
    const res = await search(u);
    expect(res.status).toBe(http);
    expect(res.body.error.code).toBe(code);
    expect(typeof res.body.error.message).toBe("string");
    const ev = await prisma.searchEvent.findFirst();
    expect(ev?.status).toBe(status);
    expect(await prisma.profileSnapshot.count()).toBe(0);
  });
});

describe("profile retrieval & media", () => {
  it("retrieves the stored profile, snapshot and paginated media without calling the API", async () => {
    await search("alpha");
    const p = await request(app).get("/api/instagram/profile/alpha");
    expect(p.status).toBe(200);
    expect(p.body.profile.username).toBe("alpha");

    const snap = await request(app).get("/api/instagram/profile/alpha/snapshot");
    expect(snap.body.snapshot.followersCount).toBe(p.body.profile.followersCount);

    const reels = await request(app).get("/api/instagram/profile/alpha/media?type=reels&pageSize=2");
    expect(reels.body.items).toHaveLength(2);
    expect(reels.body.items.every((m: { isReel: boolean }) => m.isReel)).toBe(true);
    expect(reels.body.total).toBe(4);
    const posts = await request(app).get("/api/instagram/profile/alpha/media?type=posts");
    expect(posts.body.items.every((m: { isReel: boolean }) => !m.isReel)).toBe(true);
  });

  it("returns 404 for a never-searched profile", async () => {
    const res = await request(app).get("/api/instagram/profile/neverseen");
    expect(res.status).toBe(404);
  });
});

describe("historical snapshots & analytics", () => {
  async function seedHistory() {
    await search("hist");
    const profile = await prisma.instagramProfile.findFirstOrThrow({ where: { username: "hist" } });
    // Two earlier days of real stored snapshots + search events.
    for (const [day, followers] of [["2026-09-24", 100], ["2026-09-25", 110]] as const) {
      await prisma.profileSnapshot.create({
        data: { profileId: profile.id, dataSource: "mock", followersCount: followers, followingCount: 5, mediaCount: 9, reelCount: 2, capturedAt: new Date(`${day}T12:00:00Z`) },
      });
      await prisma.searchEvent.create({
        data: { profileId: profile.id, dataSource: "mock", searchedUsername: "hist", status: "SUCCESS", searchedAt: new Date(`${day}T12:00:00Z`) },
      });
    }
    await prisma.searchEvent.create({
      data: { dataSource: "mock", searchedUsername: "other", status: "NOT_FOUND", searchedAt: new Date("2026-09-25T13:00:00Z") },
    });
    return profile;
  }

  it("returns date-wise profile history from stored snapshots", async () => {
    await seedHistory();
    const res = await request(app).get(`/api/instagram/profile/hist/history?tz=${TZ}&from=2026-09-24&to=2026-09-25`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([
      { date: "2026-09-25", followers: 110, following: 5, media: 9, reels: 2, searches: 1, snapshots: 1 },
      { date: "2026-09-24", followers: 100, following: 5, media: 9, reels: 2, searches: 1, snapshots: 1 },
    ]);
  });

  it("serves daily bar-chart series with date filtering", async () => {
    await seedHistory();
    const counts = await request(app).get(`/api/analytics/daily?metric=searchCount&from=2026-09-24&to=2026-09-25&tz=${TZ}`);
    expect(counts.body.points).toEqual([
      { date: "2026-09-24", value: 1 },
      { date: "2026-09-25", value: 2 },
    ]);
    const followers = await request(app).get(`/api/analytics/daily?metric=followers&username=hist&from=2026-09-23&to=2026-09-25&tz=${TZ}`);
    expect(followers.body.points).toEqual([
      { date: "2026-09-23", value: null },
      { date: "2026-09-24", value: 100 },
      { date: "2026-09-25", value: 110 },
    ]);
    const needsUser = await request(app).get(`/api/analytics/daily?metric=followers&range=7d&tz=${TZ}`);
    expect(needsUser.status).toBe(400);
    const badMetric = await request(app).get(`/api/analytics/daily?metric=nope`);
    expect(badMetric.status).toBe(400);
  });

  it("serves the search distribution for the pie chart", async () => {
    await seedHistory();
    const res = await request(app).get(`/api/analytics/search-distribution?from=2026-09-24&to=2026-09-25&tz=${TZ}`);
    expect(res.body.total).toBe(3);
    expect(res.body.slices).toEqual([
      { username: "hist", count: 2, percent: 67 },
      { username: "other", count: 1, percent: 33 },
    ]);
  });

  it("serves calendar months and per-date details", async () => {
    await seedHistory();
    const cal = await request(app).get(`/api/calendar?month=2026-09&tz=${TZ}`);
    const d25 = cal.body.days.find((d: { date: string }) => d.date === "2026-09-25");
    expect(d25).toMatchObject({ searches: 2, profiles: 2 });

    const date = await request(app).get(`/api/analytics/date/2026-09-25?tz=${TZ}`);
    expect(date.body).toMatchObject({ date: "2026-09-25", totalSearches: 2, profilesChecked: 2, successfulSearches: 1 });
    expect(date.body.snapshots).toHaveLength(1);
    expect((await request(app).get("/api/analytics/date/2026-13-40")).status).toBe(400);
  });

  it("computes summary cards", async () => {
    await seedHistory();
    const res = await request(app).get(`/api/analytics/summary?tz=${TZ}`);
    expect(res.body).toMatchObject({ dataSource: "mock", totalSearches: 4, profilesTracked: 1, searchesToday: 1 });
    expect(res.body.mediaAvailable).toBe(4);
    expect(res.body.lastSearch.username).toBe("hist");
  });
});

describe("search history", () => {
  it("filters, paginates and exports CSV", async () => {
    await search("one");
    await search("two");
    await search("private_x");
    const all = await request(app).get("/api/search-history?pageSize=2");
    expect(all.body.total).toBe(3);
    expect(all.body.items).toHaveLength(2);
    expect(all.body.totalPages).toBe(2);
    const failed = await request(app).get("/api/search-history?status=PRIVATE");
    expect(failed.body.items.map((i: { username: string }) => i.username)).toEqual(["private_x"]);
    const byUser = await request(app).get("/api/search-history?username=tw");
    expect(byUser.body.total).toBe(1);
    expect((await request(app).get("/api/search-history?status=BOGUS")).status).toBe(400);

    const csv = await request(app).get("/api/search-history/export.csv");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("Username,Profile Name,Search Date");
    expect(csv.text).toContain("@two");
    expect(csv.text).toContain("DEMO DATA");

    const recent = await request(app).get("/api/search-history/recent?q=o");
    expect(recent.body.items.map((i: { username: string }) => i.username)).toEqual(["one"]);
  });
});

describe("saved profiles", () => {
  it("saves, lists and removes profiles", async () => {
    await search("keeper");
    const saved = await request(app).post("/api/saved-profiles").send({ username: "keeper" });
    expect(saved.status).toBe(201);
    const again = await request(app).post("/api/saved-profiles").send({ username: "keeper" });
    expect(again.body.id).toBe(saved.body.id); // idempotent
    const list = await request(app).get("/api/saved-profiles");
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].profile.savedId).toBe(saved.body.id);
    expect((await request(app).post("/api/saved-profiles").send({ username: "unknown" })).status).toBe(404);
    expect((await request(app).delete(`/api/saved-profiles/${saved.body.id}`)).status).toBe(200);
    expect((await request(app).get("/api/saved-profiles")).body.items).toHaveLength(0);
    expect((await request(app).delete(`/api/saved-profiles/${saved.body.id}`)).status).toBe(404);
  });
});

describe("chart color settings", () => {
  it("returns defaults, validates hex and persists updates", async () => {
    const get = await request(app).get("/api/settings/chart-colors");
    expect(get.body.colors.primary).toBe("#6366F1");
    const bad = await request(app).put("/api/settings/chart-colors").send({ primary: "red" });
    expect(bad.status).toBe(400);
    const unknownKey = await request(app).put("/api/settings/chart-colors").send({ hacker: "#000000" });
    expect(unknownKey.status).toBe(400);
    const ok = await request(app).put("/api/settings/chart-colors").send({ primary: "#112233", accent: "#abcdef" });
    expect(ok.body.colors).toMatchObject({ primary: "#112233", accent: "#ABCDEF", secondary: "#8B5CF6" });
    const reset = await request(app).post("/api/settings/chart-colors/reset");
    expect(reset.body.colors.primary).toBe("#6366F1");
  });
});

describe("live tracking refresh", () => {
  it("refreshes and stores a snapshot, then enforces the minimum interval", async () => {
    await search("live");
    await prisma.profileSnapshot.updateMany({ data: { capturedAt: new Date(Date.now() - 10 * 60_000) } });
    const first = await request(app).post("/api/instagram/profile/live/refresh").send({ trigger: "live" });
    expect(first.body.refreshed).toBe(true);
    expect(await prisma.profileSnapshot.count({ where: { trigger: "LIVE_REFRESH" } })).toBe(1);
    const second = await request(app).post("/api/instagram/profile/live/refresh").send({ trigger: "live" });
    expect(second.body.refreshed).toBe(false);
    expect(second.body.nextAllowedAt).toBeTruthy();
  });
});

describe("activity timeline", () => {
  it("records server and allowed client events", async () => {
    await search("acty");
    expect((await request(app).post("/api/activity").send({ type: "play_media", username: "acty", detail: "Reel 01" })).status).toBe(201);
    expect((await request(app).post("/api/activity").send({ type: "search" })).status).toBe(400); // server-only type
    const list = await request(app).get("/api/activity");
    expect(list.body.items.map((i: { type: string }) => i.type)).toEqual(["play_media", "search"]);
  });
});

describe("AI assistant (tool-calling, local engine)", () => {
  it("calls real backend tools instead of inventing data", async () => {
    const s = await request(app).post("/api/assistant/chat").send({ message: "Search @assist.me", tz: TZ });
    expect(s.body.engine).toBe("local");
    expect(s.body.toolCalls[0]).toMatchObject({ name: "searchInstagramProfile", ok: true });
    expect(s.body.actions).toEqual([{ type: "openProfile", username: "assist.me" }]);
    const profile = await prisma.instagramProfile.findFirstOrThrow({ where: { username: "assist.me" } });
    expect(s.body.reply).toContain(profile.followersCount!.toLocaleString("en-US"));

    const today = await request(app).post("/api/assistant/chat").send({ message: "Show profiles searched today", tz: TZ });
    expect(today.body.toolCalls[0].name).toBe("getDateAnalytics");
    expect(today.body.reply).toContain("@assist.me");

    const missing = await request(app).post("/api/assistant/chat").send({ message: "Show @nobody.here analytics", tz: TZ });
    expect(missing.body.toolCalls[0]).toMatchObject({ ok: false });
    expect(missing.body.reply).toContain("not been searched");

    expect((await request(app).post("/api/assistant/chat").send({ message: "" })).status).toBe(400);
  });
});

describe("system status & secrets", () => {
  it("reports mode and capabilities without exposing secrets", async () => {
    const res = await request(app).get("/api/system/status");
    expect(res.body).toMatchObject({ mode: "mock", demoData: true, connected: true });
    expect(res.body.database.ok).toBe(true);
    expect(res.body.liveTracking.allowedIntervals).toEqual([0, 5, 15, 30, 60]);
    expect(typeof res.body.credentials.accessToken).toBe("boolean");
    expect(JSON.stringify(res.body)).not.toMatch(/EAA|sk-/);
  });

  it("returns sanitized JSON for unknown endpoints and bad JSON", async () => {
    expect((await request(app).get("/api/nope")).status).toBe(404);
    const bad = await request(app).post("/api/search").set("content-type", "application/json").send("{bad");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_INPUT");
  });
});

describe("production mode (Graph API) & data separation", () => {
  it("stores production data separately from demo data", async () => {
    await search("demo.only");
    const graph = new GraphApiInstagramProvider(
      { accessToken: "EAATEST", businessAccountId: "17841400000000001", graphVersion: "v21.0", mediaLimit: 5 },
      new CallBudget(100),
      async () => new Response(JSON.stringify(GRAPH_OK), { status: 200, headers: { "content-type": "application/json" } }),
    );
    setInstagramProvider(graph);
    clearProfileCache();

    const res = await search("brandaccount");
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe("production");
    expect(res.body.profile.fieldAvailability.followersCount).toBe("authorized_api");
    expect(res.body.profile.fieldAvailability.isVerified).toBe("unavailable");
    expect(res.body.profile.unavailableReasons.isVerified).toMatch(/not exposed/i);
    expect(res.body.media.find((m: { mediaId: string }) => m.mediaId === "m2").playable).toBe(false);

    const prodSummary = await request(app).get("/api/analytics/summary");
    expect(prodSummary.body).toMatchObject({ dataSource: "production", totalSearches: 1, profilesTracked: 1 });
    expect((await request(app).get("/api/instagram/profile/demo.only")).status).toBe(404);

    setInstagramProvider(new MockInstagramProvider());
    const mockSummary = await request(app).get("/api/analytics/summary");
    expect(mockSummary.body).toMatchObject({ dataSource: "mock", totalSearches: 1 });
    expect((await request(app).get("/api/instagram/profile/brandaccount")).status).toBe(404);
  });
});

describe("media pagination (load all accessible posts & reels)", () => {
  it("loads further pages through the provider cursor until everything is stored", async () => {
    const first = await search("pager.user");
    expect(first.body.media).toHaveLength(12);
    expect(first.body.profile.hasMoreMedia).toBe(true);
    expect(JSON.stringify(first.body)).not.toContain("demo:12"); // cursor never leaves the server

    const p2 = await request(app).post("/api/instagram/profile/pager.user/media/more");
    expect(p2.body).toEqual({ added: 12, hasMoreMedia: true, totalStored: 24 });
    const p3 = await request(app).post("/api/instagram/profile/pager.user/media/more");
    expect(p3.body).toEqual({ added: 12, hasMoreMedia: false, totalStored: 36 });
    const done = await request(app).post("/api/instagram/profile/pager.user/media/more");
    expect(done.body).toEqual({ added: 0, hasMoreMedia: false, totalStored: 36 });

    const reels = await request(app).get("/api/instagram/profile/pager.user/media?type=reels&pageSize=50");
    expect(reels.body.total).toBe(12);
    expect((await request(app).get("/api/instagram/profile/pager.user")).body.profile.hasMoreMedia).toBe(false);
    expect((await request(app).post("/api/instagram/profile/never.searched/media/more")).status).toBe(404);
  });
});

describe("real-world text (emoji & non-Latin scripts)", () => {
  it("stores bios and captions containing emoji", async () => {
    const body = {
      id: "17841400000000001",
      business_discovery: {
        ...GRAPH_OK.business_discovery,
        username: "emoji.brand",
        biography: "Discover what's new 🔎✨ | नमस्ते | 日本語",
        media: { data: [{ id: "e1", media_type: "IMAGE", media_url: "https://cdn/e1.jpg", caption: "Sunset 🌅🔥 #travel" }] },
      },
    };
    setInstagramProvider(
      new GraphApiInstagramProvider(
        { accessToken: "EAATEST", businessAccountId: "17841400000000001", graphVersion: "v26.0", mediaLimit: 5 },
        new CallBudget(100),
        async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
    clearProfileCache();
    const res = await search("emoji.brand");
    expect(res.status).toBe(200);
    expect(res.body.profile.bio).toBe("Discover what's new 🔎✨ | नमस्ते | 日本語");
    expect(res.body.media[0].caption).toBe("Sunset 🌅🔥 #travel");
  });
});
