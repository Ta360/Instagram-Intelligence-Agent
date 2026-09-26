import "dotenv/config";
import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  // API_PORT wins over PORT so a PORT injected for the frontend dev server can't collide;
  // hosting platforms that only set PORT (Azure, Render, …) still work.
  API_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().default(4200),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGINS: z.string().default("http://localhost:5373"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  INSTAGRAM_API_MODE: z.enum(["mock", "production"]).default("mock"),
  INSTAGRAM_ACCESS_TOKEN: optionalString,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: optionalString,
  INSTAGRAM_APP_ID: optionalString,
  INSTAGRAM_APP_SECRET: optionalString,
  INSTAGRAM_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  INSTAGRAM_MEDIA_LIMIT: z.coerce.number().int().min(1).max(50).default(24),
  INSTAGRAM_MAX_CALLS_PER_HOUR: z.coerce.number().int().min(1).max(5000).default(150),
  PROFILE_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86400).default(300),
  MIN_REFRESH_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  // Dashboard accounts: the first account can always sign up; later sign-ups only when true.
  ALLOW_SIGNUP: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  SESSION_SECRET: z.string().default("dev-only-insecure-session-secret"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print variable names only — never values.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const e = parsed.data;

if (e.NODE_ENV === "production" && (e.SESSION_SECRET === "dev-only-insecure-session-secret" || e.SESSION_SECRET.length < 32)) {
  console.error("SESSION_SECRET must be set to a random string of at least 32 characters in production.");
  process.exit(1);
}

export const env = {
  port: e.API_PORT ?? e.PORT,
  nodeEnv: e.NODE_ENV,
  isProduction: e.NODE_ENV === "production",
  corsOrigins: e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  databaseUrl: e.DATABASE_URL,
  instagram: {
    mode: e.INSTAGRAM_API_MODE,
    accessToken: e.INSTAGRAM_ACCESS_TOKEN,
    businessAccountId: e.INSTAGRAM_BUSINESS_ACCOUNT_ID,
    appId: e.INSTAGRAM_APP_ID,
    appSecret: e.INSTAGRAM_APP_SECRET,
    graphVersion: e.INSTAGRAM_GRAPH_API_VERSION,
    mediaLimit: e.INSTAGRAM_MEDIA_LIMIT,
    maxCallsPerHour: e.INSTAGRAM_MAX_CALLS_PER_HOUR,
    cacheTtlSeconds: e.PROFILE_CACHE_TTL_SECONDS,
    minRefreshIntervalMinutes: e.MIN_REFRESH_INTERVAL_MINUTES,
    get credentialsConfigured() {
      return Boolean(this.accessToken && this.businessAccountId);
    },
  },
  openai: { apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL },
  auth: { allowSignup: e.ALLOW_SIGNUP, sessionSecret: e.SESSION_SECRET },
};

export type Env = typeof env;
