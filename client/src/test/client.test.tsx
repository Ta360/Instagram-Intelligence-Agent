import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { calendarLevel, seriesStats, toBarData, toPieData, withAlpha } from "@/lib/chartTransforms";
import { monthGrid, addDaysKey, shiftMonth } from "@/lib/dates";
import { validateInstagramQuery } from "@/lib/validation";
import { instagramEmbedUrl } from "@/lib/instagram";
import { ApiError } from "@/lib/api";
import { DemoBadge, ErrorState, StatusBadge } from "@/components/common";
import { DEFAULT_CHART_COLORS } from "@/theme/chartTheme";

describe("client username validation (mirror of server)", () => {
  it("normalizes @, case and profile URLs", () => {
    expect(validateInstagramQuery("@Example.User")).toEqual({ ok: true, value: "example.user", kind: "username" });
    expect(validateInstagramQuery("https://instagram.com/abc_def/")).toEqual({ ok: true, value: "abc_def", kind: "username" });
    expect(validateInstagramQuery("17841400008460056")).toMatchObject({ ok: true, kind: "userId" });
  });
  it("rejects invalid input", () => {
    for (const bad of ["", "has space", "x..y", ".x", "a".repeat(31), "123"]) expect(validateInstagramQuery(bad).ok).toBe(false);
  });
});

describe("bar chart transformation", () => {
  it("keeps nulls as gaps and formats labels", () => {
    const bars = toBarData([
      { date: "2026-09-25", value: 3 },
      { date: "2026-09-26", value: null },
    ]);
    expect(bars.map((b) => [b.date, b.value])).toEqual([
      ["2026-09-25", 3],
      ["2026-09-26", null],
    ]);
    expect(bars[0]!.label).toMatch(/^25 Sep/);
    expect(bars[1]!.value).toBeNull();
  });
  it("computes stats from real values only", () => {
    expect(seriesStats([{ date: "a", value: 2 }, { date: "b", value: null }, { date: "c", value: 5 }])).toEqual({ total: 7, max: 5, latest: 5, daysWithData: 2 });
    expect(seriesStats([{ date: "a", value: null }]).latest).toBeNull();
  });
});

describe("pie chart transformation", () => {
  it("assigns colors from the centralized palette and greys out Others", () => {
    const pie = toPieData(
      [
        { username: "a", count: 3, percent: 60 },
        { username: "b", count: 1, percent: 20 },
        { username: "Others", count: 1, percent: 20 },
      ],
      { ...DEFAULT_CHART_COLORS, primary: "#123456" },
    );
    expect(pie[0]).toMatchObject({ name: "@a", fill: "#123456" });
    expect(pie[1]!.fill).toBe(DEFAULT_CHART_COLORS.accent);
    expect(pie[2]).toMatchObject({ name: "Others", fill: "#64748B" });
  });
  it("converts hex to rgba", () => {
    expect(withAlpha("#6366F1", 0.5)).toBe("rgba(99, 102, 241, 0.5)");
    expect(withAlpha("bad", 0.5)).toBe("bad");
  });
});

describe("calendar", () => {
  it("builds a Monday-first 6-week grid", () => {
    const g = monthGrid("2026-09");
    expect(g).toHaveLength(42);
    expect(g[0]).toEqual({ key: "2026-08-31", inMonth: false }); // 1 Sep 2026 is a Tuesday
    expect(g.filter((d) => d.inMonth)).toHaveLength(30);
  });
  it("maps search counts to intensity levels", () => {
    expect(calendarLevel(0)).toEqual({ level: 0, color: null });
    expect(calendarLevel(3).color).toBe("secondary");
    expect(calendarLevel(5).color).toBe("success");
    expect(calendarLevel(8).color).toBe("warning");
  });
  it("shifts days and months", () => {
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("Instagram official embed URLs", () => {
  it("builds embed URLs from official permalinks only", () => {
    expect(instagramEmbedUrl("https://www.instagram.com/reel/DduA2TmyKMx/")).toBe("https://www.instagram.com/reel/DduA2TmyKMx/embed/");
    expect(instagramEmbedUrl("https://www.instagram.com/p/DdulMV-D4cS/?igsh=abc")).toBe("https://www.instagram.com/p/DdulMV-D4cS/embed/");
    expect(instagramEmbedUrl("https://instagram.com/reels/Abc_123-x/")).toBe("https://www.instagram.com/reel/Abc_123-x/embed/");
    expect(instagramEmbedUrl(null)).toBeNull();
    expect(instagramEmbedUrl("https://evil.example/reel/abc12/")).toBeNull();
    expect(instagramEmbedUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("error & demo states", () => {
  it("renders a private-profile message without raw details", () => {
    render(<ErrorState error={new ApiError("PRIVATE_PROFILE", "Private-profile information is not available through this application.", 403)} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Private Profile");
    expect(screen.getByRole("alert")).toHaveTextContent("not available through this application");
  });
  it("shows the rate-limit retry hint", () => {
    render(<ErrorState error={new ApiError("RATE_LIMITED", "Instagram API rate limit reached. Please try again later.", 429, 900)} />);
    expect(screen.getByText(/Try again in about 15 min/)).toBeInTheDocument();
  });
  it("labels demo data and hides the label for production", () => {
    const { rerender } = render(<DemoBadge dataSource="mock" />);
    expect(screen.getByText("DEMO DATA")).toBeInTheDocument();
    rerender(<DemoBadge dataSource="production" />);
    expect(screen.queryByText("DEMO DATA")).toBeNull();
  });
  it("renders search statuses", () => {
    render(<StatusBadge status="PERMISSION_REQUIRED" />);
    expect(screen.getByText("Permission required")).toBeInTheDocument();
  });
});
