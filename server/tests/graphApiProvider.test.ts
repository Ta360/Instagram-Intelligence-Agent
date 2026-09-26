import { describe, expect, it, vi } from "vitest";
import { CallBudget } from "../src/services/instagram/callBudget.js";
import { GRAPH_OK } from "./fixtures.js";
import { GraphApiInstagramProvider, type FetchLike } from "../src/services/instagram/providers/graphApiProvider.js";

const cfg = { accessToken: "EAATESTTOKEN123", businessAccountId: "17841400000000001", appSecret: "shh", graphVersion: "v21.0", mediaLimit: 5 };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function make(fetchImpl: FetchLike, budget = new CallBudget(100)) {
  return { provider: new GraphApiInstagramProvider(cfg, budget, fetchImpl), budget };
}

describe("Graph API provider (Business Discovery)", () => {
  it("requests business_discovery with the token in a header, not the URL", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GRAPH_OK, 200, { "x-app-usage": '{"call_count":3}' }));
    const { provider, budget } = make(fetchImpl);
    const r = await provider.fetchProfile({ kind: "username", value: "brandaccount", raw: "brandaccount" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/v21.0/${cfg.businessAccountId}?`);
    expect(decodeURIComponent(url)).toContain("business_discovery.username(brandaccount)");
    expect(url).toContain("appsecret_proof=");
    expect(url).not.toContain(cfg.accessToken);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${cfg.accessToken}`);
    expect(budget.snapshot().used).toBe(1);
    expect(budget.metaUsage).toEqual({ "x-app-usage": { call_count: 3 } });

    expect(r.profile).toMatchObject({ username: "brandaccount", followersCount: 12345, followingCount: 67, mediaCount: 890, isVerified: null, accountType: null, profileUrl: "https://www.instagram.com/brandaccount/" });
    expect(r.profile.fieldAvailability.followersCount).toBe("authorized_api");
    expect(r.profile.fieldAvailability.isVerified).toBe("unavailable");
    expect(r.profile.fieldAvailability.profileUrl).toBe("public");
    expect(r.media).toHaveLength(3);
    expect(r.media[1]!.mediaUrl).toBeNull(); // API withheld the URL → UI falls back to Open on Instagram
    expect(r.media[1]!.likeCount).toBeNull();
    expect(r.media[2]!.thumbnailUrl).toBe("https://cdn/i.jpg");
  });

  it("maps 'user not found' to NOT_FOUND", async () => {
    const { provider } = make(async () => jsonResponse({ error: { code: 110, error_subcode: 2207013, message: "cannot be found" } }, 400));
    await expect(provider.fetchProfile({ kind: "username", value: "someone", raw: "someone" })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("maps throttling to RATE_LIMITED and engages a cooldown", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 4, message: "Application request limit reached" } }, 400));
    const { provider, budget } = make(fetchImpl);
    await expect(provider.fetchProfile({ kind: "username", value: "x", raw: "x" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(budget.snapshot().cooldownUntil).not.toBeNull();
    // During cooldown no request leaves the server.
    await expect(provider.fetchProfile({ kind: "username", value: "x", raw: "x" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps permission and token errors to PERMISSION_REQUIRED without leaking upstream text", async () => {
    const { provider } = make(async () => jsonResponse({ error: { code: 10, message: "secret internal detail" } }, 403));
    const err = await provider.fetchProfile({ kind: "username", value: "x", raw: "x" }).catch((e) => e);
    expect(err.code).toBe("PERMISSION_REQUIRED");
    expect(err.userMessage).not.toContain("secret internal detail");

    const { provider: p2 } = make(async () => jsonResponse({ error: { code: 190, message: "expired" } }, 400));
    await expect(p2.fetchProfile({ kind: "username", value: "x", raw: "x" })).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    const { provider } = make(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(provider.fetchProfile({ kind: "username", value: "x", raw: "x" })).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 502 });
  });

  it("refuses numeric User ID lookups for other accounts (no workaround)", async () => {
    const fetchImpl = vi.fn();
    const { provider } = make(fetchImpl as unknown as FetchLike);
    await expect(provider.fetchProfile({ kind: "userId", value: "123456789", raw: "123456789" })).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("respects the local call budget", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GRAPH_OK));
    const { provider } = make(fetchImpl, new CallBudget(1));
    await provider.fetchProfile({ kind: "username", value: "brandaccount", raw: "" });
    await expect(provider.fetchProfile({ kind: "username", value: "brandaccount", raw: "" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("Graph API media pagination", () => {
  const page = (after: string | null, ids: string[]) => ({
    data: ids.map((id) => ({ id, media_type: "IMAGE", media_url: `https://cdn/${id}.jpg`, timestamp: "2026-09-01T00:00:00+0000" })),
    paging: after ? { cursors: { after }, next: "https://graph.facebook.com/next" } : { cursors: { after: "END" } },
  });

  it("returns the next cursor only when Instagram reports more pages", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ business_discovery: { ...GRAPH_OK.business_discovery, media: page("QVFIUabc123", ["a", "b"]) } }));
    const { provider } = make(fetchImpl);
    const first = await provider.fetchProfile({ kind: "username", value: "brandaccount", raw: "" });
    expect(first.mediaCursor).toBe("QVFIUabc123");

    fetchImpl.mockImplementationOnce(async () => jsonResponse({ business_discovery: { id: "1", media: page(null, ["c"]) } }));
    const next = await provider.fetchMoreMedia({ kind: "username", value: "brandaccount", raw: "" }, "QVFIUabc123");
    const [url] = fetchImpl.mock.calls[1] as unknown as [string];
    expect(decodeURIComponent(url)).toContain("business_discovery.username(brandaccount){media.after(QVFIUabc123).limit(5)");
    expect(next.media.map((m) => m.mediaId)).toEqual(["c"]);
    expect(next.mediaCursor).toBeNull(); // no paging.next → all media loaded
  });

  it("rejects malformed cursors before calling the API", async () => {
    const fetchImpl = vi.fn();
    const { provider } = make(fetchImpl as unknown as FetchLike);
    await expect(provider.fetchMoreMedia({ kind: "username", value: "x", raw: "" }, "abc){evil")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Business Discovery cursor shape (no paging.next)", () => {
  it("treats an after-cursor on a full page as 'more available' and a short page as the end", async () => {
    const ids = ["1", "2", "3", "4", "5"]; // mediaLimit in these tests is 5
    const edge = (n: number) => ({
      data: ids.slice(0, n).map((id) => ({ id, media_type: "IMAGE", media_url: `https://cdn/${id}.jpg` })),
      paging: { cursors: { before: "QkVGT1JF", after: "QUZURVI" } },
    });
    const { provider } = make(async () => jsonResponse({ business_discovery: { ...GRAPH_OK.business_discovery, media: edge(5) } }));
    expect((await provider.fetchProfile({ kind: "username", value: "brandaccount", raw: "" })).mediaCursor).toBe("QUZURVI");

    const { provider: p2 } = make(async () => jsonResponse({ business_discovery: { ...GRAPH_OK.business_discovery, media: edge(3) } }));
    expect((await p2.fetchProfile({ kind: "username", value: "brandaccount", raw: "" })).mediaCursor).toBeNull();
  });
});
