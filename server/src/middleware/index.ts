import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError, ERROR_MESSAGES } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { safeTimeZone } from "../lib/dates.js";

// ─── Request logging (method, path, status, duration — never query strings or bodies) ──
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info("http", { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) });
  });
  next();
}

// ─── Rate limits (protect this server and, indirectly, the Instagram API quota) ─────
// Integration tests fire many requests in seconds; limits stay active in dev and production.
const skipInTests = () => env.nodeEnv === "test";

const limitHandler = (_req: Request, res: Response) =>
  res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again shortly." } });

export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false, handler: limitHandler, skip: skipInTests });
export const searchLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, handler: limitHandler, skip: skipInTests });
export const assistantLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, handler: limitHandler, skip: skipInTests });
export const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, handler: limitHandler, skip: skipInTests });

// ─── Optional dashboard authentication (enabled when DASHBOARD_PASSWORD is set) ─────
export const SESSION_COOKIE = "iia_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(value: string) {
  return createHmac("sha256", env.auth.sessionSecret).update(value).digest("base64url");
}

export function createSessionToken(now = Date.now()) {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const expected = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
  return Number(exp) > now;
}

export function passwordMatches(input: unknown): boolean {
  if (!env.auth.password || typeof input !== "string") return false;
  const a = Buffer.from(sign(input));
  const b = Buffer.from(sign(env.auth.password));
  return timingSafeEqual(a, b);
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function isAuthenticated(req: Request) {
  return !env.auth.password || verifySessionToken(readCookie(req, SESSION_COOKIE));
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (isAuthenticated(req)) return next();
  next(new AppError("UNAUTHORIZED"));
}

// ─── Helpers ────────────────────────────────────────────────────────────────
export function tzOf(req: Request): string {
  return safeTimeZone(req.query.tz ?? req.body?.tz);
}

// ─── Errors: sanitized JSON, never stack traces or upstream payloads ────────────
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.retryAfterSeconds) res.setHeader("Retry-After", String(err.retryAfterSeconds));
    return res.status(err.status).json({
      error: { code: err.code, message: err.userMessage, ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}) },
    });
  }
  if (err && typeof err === "object" && (err as { type?: string }).type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Malformed JSON body." } });
  }
  if (err && typeof err === "object" && (err as { name?: string }).name === "ZodError") {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: ERROR_MESSAGES.INVALID_INPUT } });
  }
  logger.error("unhandled_error", { path: req.path, error: String((err as Error)?.stack ?? err) });
  res.status(500).json({ error: { code: "INTERNAL", message: ERROR_MESSAGES.INTERNAL } });
}
