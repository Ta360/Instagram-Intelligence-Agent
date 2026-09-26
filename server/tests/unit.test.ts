import { describe, expect, it } from "vitest";
import { addDays, dayKey, eachDay, isDayKey, monthRange, startOfZonedDay, zonedRange } from "../src/lib/dates.js";
import { csvCell } from "../src/lib/csv.js";
import { redact } from "../src/lib/logger.js";
import { isHexColor, parseInstagramQuery } from "../src/lib/validation.js";
import { CallBudget } from "../src/services/instagram/callBudget.js";
import {
  bucketCountsByDay,
  buildCalendar,
  buildDistribution,
  buildProfileHistory,
  lastValuePerDay,
  resolveRange,
} from "../src/services/instagram/analyticsTransforms.js";
import { planCalls, parseDateRange } from "../src/services/ai/localIntentParser.js";

describe("username / User ID validation", () => {
  it.each([
    ["exampleuser", "exampleuser"],
    ["@ExampleUser", "exampleuser"],
    ["  @nat.geo_2026 ", "nat.geo_2026"],
    ["https://www.instagram.com/some.user/", "some.user"],
    ["instagram.com/another_user?hl=en", "another_user"],
  ])("accepts %s", (input, expected) => {
    const r = parseInstagramQuery(input);
    expect(r.ok && r.query.kind === "username" && r.query.value).toBe(expected);
  });

  it("treats 5–20 digit values as a User ID", () => {
    const r = parseInstagramQuery("17841400008460056");
    expect(r.ok && r.query.kind).toBe("userId");
  });

  it.each([
    ["", "Enter"],
    ["   ", "Enter"],
    ["a".repeat(31), "at most 30"],
    ["bad user", "only contain"],
    ["user!", "only contain"],
    [".leading", "start or end"],
    ["trailing.", "start or end"],
    ["two..dots", "consecutive"],
    ["1234", "5–20 digits"],
  ])("rejects %j", (input, msg) => {
    const r = parseInstagramQuery(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it("rejects non-strings", () => {
    expect(parseInstagramQuery(42).ok).toBe(false);
    expect(parseInstagramQuery(undefined).ok).toBe(false);
  });

  it("validates hex colors", () => {
    expect(isHexColor("#6366F1")).toBe(true);
    expect(isHexColor("#6366f1")).toBe(true);
    expect(isHexColor("6366F1")).toBe(false);
    expect(isHexColor("#FFF")).toBe(false);
    expect(isHexColor("#GGGGGG")).toBe(false);
  });
});

describe("date filtering helpers", () => {
  it("computes day keys per timezone", () => {
    const d = new Date("2026-09-25T20:00:00Z");
    expect(dayKey(d, "UTC")).toBe("2026-09-25");
    expect(dayKey(d, "Asia/Kolkata")).toBe("2026-09-26"); // +05:30
    expect(dayKey(d, "America/Los_Angeles")).toBe("2026-09-25");
  });

  it("finds the UTC start of a local day", () => {
    expect(startOfZonedDay("2026-09-26", "Asia/Kolkata").toISOString()).toBe("2026-09-25T18:30:00.000Z");
    expect(startOfZonedDay("2026-09-26", "UTC").toISOString()).toBe("2026-09-26T00:00:00.000Z");
    // DST: New York switches to EST on 2026-11-01
    expect(startOfZonedDay("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfZonedDay("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("builds inclusive ranges and day lists", () => {
    const { start, end } = zonedRange("2026-09-24", "2026-09-26", "UTC");
    expect(start.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(eachDay("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(isDayKey("2026-02-30")).toBe(false);
  });

  it("resolves range presets", () => {
    expect(resolveRange("today", "2026-09-26")).toEqual({ from: "2026-09-26", to: "2026-09-26" });
    expect(resolveRange("7d", "2026-09-26")).toEqual({ from: "2026-09-20", to: "2026-09-26" });
    expect(resolveRange("30d", "2026-09-26").from).toBe("2026-08-28");
    expect(resolveRange("90d", "2026-09-26").from).toBe("2026-06-29");
    expect(resolveRange("custom", "2026-09-26", { from: "2026-09-01", to: "2026-09-10" })).toEqual({ from: "2026-09-01", to: "2026-09-10" });
    expect(() => resolveRange("custom", "2026-09-26", { from: "2026-09-10", to: "2026-09-01" })).toThrow();
    expect(() => resolveRange("custom", "2026-09-26", { from: "2024-01-01", to: "2026-09-01" })).toThrow(/366/);
  });
});

describe("bar chart data transformation", () => {
  const days = ["2026-09-24", "2026-09-25", "2026-09-26"];

  it("counts events per day with real zeros", () => {
    const ts = [new Date("2026-09-24T10:00:00Z"), new Date("2026-09-26T01:00:00Z"), new Date("2026-09-26T23:59:00Z"), new Date("2026-09-27T00:00:00Z")];
    expect(bucketCountsByDay(ts, days, "UTC")).toEqual([
      { date: "2026-09-24", value: 1 },
      { date: "2026-09-25", value: 0 },
      { date: "2026-09-26", value: 2 },
    ]);
  });

  it("buckets by the viewer's timezone", () => {
    const ts = [new Date("2026-09-25T20:00:00Z")];
    expect(bucketCountsByDay(ts, days, "Asia/Kolkata").find((p) => p.value)?.date).toBe("2026-09-26");
  });

  it("uses the last snapshot per day and leaves gaps as null (never invented)", () => {
    const snaps = [
      { capturedAt: new Date("2026-09-24T08:00:00Z"), value: 100 },
      { capturedAt: new Date("2026-09-24T18:00:00Z"), value: 120 },
      { capturedAt: new Date("2026-09-26T09:00:00Z"), value: null },
      { capturedAt: new Date("2026-09-26T10:00:00Z"), value: 130 },
    ];
    expect(lastValuePerDay(snaps, days, "UTC")).toEqual([
      { date: "2026-09-24", value: 120 },
      { date: "2026-09-25", value: null },
      { date: "2026-09-26", value: 130 },
    ]);
  });
});

describe("pie chart data transformation", () => {
  it("computes percentages that sum to 100", () => {
    const s = buildDistribution([
      { username: "a", count: 1 },
      { username: "b", count: 1 },
      { username: "c", count: 1 },
    ]);
    expect(s.map((x) => x.percent).reduce((a, b) => a + b)).toBe(100);
    expect(s).toHaveLength(3);
  });

  it("sorts by count and groups the tail into Others", () => {
    const s = buildDistribution(
      [
        { username: "d", count: 10 },
        { username: "a", count: 45 },
        { username: "b", count: 30 },
        { username: "c", count: 15 },
        { username: "e", count: 0 },
      ],
      2,
    );
    expect(s.map((x) => x.username)).toEqual(["a", "b", "Others"]);
    expect(s.map((x) => x.percent)).toEqual([45, 30, 25]);
  });

  it("returns empty for no data", () => {
    expect(buildDistribution([])).toEqual([]);
  });
});

describe("calendar & history transforms", () => {
  it("groups searches per day with unique profiles", () => {
    const cal = buildCalendar(
      [
        { searchedAt: new Date("2026-09-26T09:00:00Z"), searchedUsername: "a" },
        { searchedAt: new Date("2026-09-26T10:00:00Z"), searchedUsername: "a" },
        { searchedAt: new Date("2026-09-26T11:00:00Z"), searchedUsername: "b" },
        { searchedAt: new Date("2026-09-25T11:00:00Z"), searchedUsername: "c" },
      ],
      "UTC",
    );
    expect(cal).toEqual([
      { date: "2026-09-25", searches: 1, profiles: 1, usernames: ["c"] },
      { date: "2026-09-26", searches: 3, profiles: 2, usernames: ["a", "b"] },
    ]);
  });

  it("builds date-wise profile history from stored data only", () => {
    const rows = buildProfileHistory(
      [
        { capturedAt: new Date("2026-09-24T08:00:00Z"), followersCount: 10, followingCount: 5, mediaCount: 3, reelCount: 1 },
        { capturedAt: new Date("2026-09-24T09:00:00Z"), followersCount: 11, followingCount: 5, mediaCount: 3, reelCount: 1 },
      ],
      [{ searchedAt: new Date("2026-09-24T09:00:00Z") }, { searchedAt: new Date("2026-09-25T09:00:00Z") }],
      "UTC",
    );
    expect(rows).toEqual([
      { date: "2026-09-25", followers: null, following: null, media: null, reels: null, searches: 1, snapshots: 0 },
      { date: "2026-09-24", followers: 11, following: 5, media: 3, reels: 1, searches: 1, snapshots: 2 },
    ]);
  });
});

describe("rate-limit handling (outbound call budget)", () => {
  it("blocks calls beyond the hourly budget and frees them after the window", () => {
    const b = new CallBudget(2, 1000);
    b.consume(0);
    b.consume(10);
    expect(() => b.consume(20)).toThrowError(/rate limit/i);
    expect(b.snapshot(20).used).toBe(2);
    b.consume(1001); // first call left the window
  });

  it("honours a cooldown after Instagram throttles", () => {
    const b = new CallBudget(100);
    b.engageCooldown(60, 0);
    expect(() => b.consume(1000)).toThrow();
    b.consume(61_000);
  });
});

describe("security helpers", () => {
  it("redacts credentials from log lines", () => {
    const line = redact("GET ?access_token=EAABsecretsecretsecretsecret&x=1 Bearer abc.def sk-proj-1234567890abcdef");
    expect(line).not.toContain("EAABsecret");
    expect(line).not.toContain("abc.def");
    expect(line).not.toContain("sk-proj");
  });

  it("neutralises CSV formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
});

describe("assistant command parsing", () => {
  const ctx = { tz: "UTC", today: "2026-09-26" };
  it.each([
    ["Search @exampleuser", "searchInstagramProfile"],
    ["Show @exampleuser analytics", "getProfileSnapshot"],
    ["Show today's searches", "getDateAnalytics"],
    ["Show profiles searched today", "getDateAnalytics"],
    ["Show me the profile tracking for @exampleuser", "getProfileSnapshot"],
    ["Show my most searched profiles this week", "getTopProfiles"],
    ["Show profile activity for September 2026", "getMonthActivity"],
    ["Show my saved profiles", "getSavedProfiles"],
  ])("%s → %s", (msg, tool) => {
    expect(planCalls(msg, ctx)[0]?.tool).toBe(tool);
  });

  it("returns no plan for unrelated text", () => {
    expect(planCalls("hello there", ctx)).toEqual([]);
  });

  it("parses dates", () => {
    expect(parseDateRange("activity on 26 Sep 2026", ctx)).toEqual({ date: "2026-09-26" });
    expect(parseDateRange("yesterday", ctx)).toEqual({ date: "2026-09-25" });
    expect(parseDateRange("this week", ctx)).toEqual({ from: "2026-09-20", to: "2026-09-26" });
  });
});
