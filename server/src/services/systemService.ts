import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { callBudget, getConnectionStatus, getInstagramProvider } from "./instagram/instagramClient.js";

const ALL_INTERVALS = [0, 5, 15, 30, 60];

/** Live-tracking intervals (minutes; 0 = manual) permitted by the current configuration. */
export function allowedRefreshIntervals(): number[] {
  const p = getInstagramProvider();
  if (p.dataSource === "mock") return ALL_INTERVALS;
  return ALL_INTERVALS.filter((m) => m === 0 || m >= env.instagram.minRefreshIntervalMinutes);
}

type CapabilityState = "supported" | "limited" | "unavailable";
function capabilities(mode: "mock" | "production"): { feature: string; state: CapabilityState; note: string }[] {
  const demo = mode === "mock";
  return [
    { feature: "Business & Creator profile lookup by username", state: "supported", note: demo ? "Demo data in mock mode." : "Instagram Graph API — Business Discovery." },
    { feature: "Followers / following / media counts", state: "supported", note: "Returned for Business & Creator accounts." },
    { feature: "Recent posts & reels", state: "supported", note: `Latest ${env.instagram.mediaLimit} media items per lookup.` },
    { feature: "In-app video playback", state: "limited", note: "Only when the API returns a direct media URL; otherwise thumbnail + Open on Instagram." },
    { feature: "Like / comment counts", state: "limited", note: "Hidden when the account owner has hidden like counts." },
    { feature: "Personal (non-business) accounts", state: "unavailable", note: "Not accessible through the official API." },
    { feature: "Private profiles", state: "unavailable", note: "Private-profile information is never accessed." },
    { feature: "Verified badge / account type", state: "unavailable", note: "Not exposed by Business Discovery." },
    { feature: "Stories, followers lists, DMs", state: "unavailable", note: "Not available for other accounts via the official API." },
    { feature: "Lookup by numeric User ID", state: "limited", note: "Only for your own authorized account; search others by username." },
  ];
}

export async function getSystemStatus() {
  const provider = getInstagramProvider();
  const mode = provider.dataSource;

  let database = { ok: true, message: "PostgreSQL reachable." };
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = { ok: false, message: "Database unreachable. Is PostgreSQL running?" };
  }

  const connection = await getConnectionStatus();

  return {
    appName: "Instagram Intelligence Agent",
    version: "1.0.0",
    mode,
    demoData: mode === "mock",
    provider: provider.name,
    connected: connection.ok,
    connection,
    credentials: {
      // Booleans only — secret values never leave the server.
      accessToken: Boolean(env.instagram.accessToken),
      businessAccountId: Boolean(env.instagram.businessAccountId),
      appId: Boolean(env.instagram.appId),
      appSecret: Boolean(env.instagram.appSecret),
      graphVersion: env.instagram.graphVersion,
    },
    database,
    ai: { provider: env.openai.apiKey ? "openai" : "local", model: env.openai.apiKey ? env.openai.model : "rule-based parser" },
    rateBudget: callBudget.snapshot(),
    cache: { profileTtlSeconds: env.instagram.cacheTtlSeconds },
    liveTracking: {
      allowedIntervals: allowedRefreshIntervals(),
      minIntervalMinutes: mode === "mock" ? 1 : env.instagram.minRefreshIntervalMinutes,
    },
    auth: { required: true, signupOpenByConfig: env.auth.allowSignup },
    capabilities: capabilities(mode),
    serverTime: new Date().toISOString(),
  };
}
