import { env } from "../../config/env.js";
import { CallBudget } from "./callBudget.js";
import { MockInstagramProvider } from "./providers/mockProvider.js";
import { GraphApiInstagramProvider, UnconfiguredInstagramProvider } from "./providers/graphApiProvider.js";
import type { ConnectionStatus, InstagramProvider } from "./types.js";

/**
 * Provider factory. The rest of the app only talks to the `InstagramProvider`
 * interface, so swapping API providers never touches the frontend or the
 * analytics layer.
 */
export const callBudget = new CallBudget(env.instagram.maxCallsPerHour);

let provider: InstagramProvider | null = null;

export function createProviderFromEnv(): InstagramProvider {
  const ig = env.instagram;
  if (ig.mode === "mock") return new MockInstagramProvider();
  if (!ig.credentialsConfigured) return new UnconfiguredInstagramProvider();
  return new GraphApiInstagramProvider(
    {
      accessToken: ig.accessToken!,
      businessAccountId: ig.businessAccountId!,
      appSecret: ig.appSecret,
      graphVersion: ig.graphVersion,
      mediaLimit: ig.mediaLimit,
    },
    callBudget,
  );
}

export function getInstagramProvider(): InstagramProvider {
  if (!provider) provider = createProviderFromEnv();
  return provider;
}

/** Test hook: inject a provider (e.g. a stubbed Graph API provider). */
export function setInstagramProvider(p: InstagramProvider | null) {
  provider = p;
  connectionCache = null;
}

// Connection checks cost an API call, so they are cached for 5 minutes.
let connectionCache: { at: number; status: ConnectionStatus } | null = null;
export async function getConnectionStatus(force = false): Promise<ConnectionStatus> {
  const p = getInstagramProvider();
  if (!force && connectionCache && Date.now() - connectionCache.at < 5 * 60_000) return connectionCache.status;
  const status = await p.checkConnection();
  connectionCache = { at: Date.now(), status };
  return status;
}
