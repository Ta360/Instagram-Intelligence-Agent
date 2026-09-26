import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHmac, type BinaryLike, type ScryptOptions } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

/**
 * Dashboard accounts. These are credentials for THIS dashboard only — the app
 * never asks for, receives or stores Instagram passwords.
 */

const scrypt = (password: BinaryLike, salt: BinaryLike, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (e, k) => (e ? reject(e) : resolve(k))));

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// A fixed hash so failed logins for unknown emails take the same time as real ones.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("timing-equalisation-password"));

// ─── Validation ────────────────────────────────────────────────────────────
const email = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");
const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Password must contain at least one letter and one number.");

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email,
  password,
});
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.").max(128), remember: z.boolean().optional() });

function firstIssue(err: z.ZodError) {
  return err.issues[0]?.message ?? "Invalid input.";
}

// ─── Sign-up policy ────────────────────────────────────────────────────────
/** The first account can always be created; after that only when ALLOW_SIGNUP=true. */
export async function signupOpen(): Promise<boolean> {
  if (env.auth.allowSignup) return true;
  return (await prisma.user.count()) === 0;
}

export type PublicUser = { id: string; email: string; name: string; createdAt: string; lastLoginAt: string | null };
const toPublic = (u: { id: string; email: string; name: string; createdAt: Date; lastLoginAt: Date | null }): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
});

export async function signup(input: unknown) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", firstIssue(parsed.error));
  if (!(await signupOpen())) {
    throw new AppError("FORBIDDEN", "Sign-up is closed. Ask the dashboard owner to create an account for you.");
  }
  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) throw new AppError("CONFLICT", "An account with this email already exists. Sign in instead.");
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      lastLoginAt: new Date(),
    },
  });
  return { user: toPublic(user), sessionVersion: user.sessionVersion };
}

export async function login(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", firstIssue(parsed.error));
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const ok = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : (await verifyPassword(parsed.data.password, await getDummyHash()), false);
  // Same message for unknown email and wrong password (no account enumeration).
  if (!user || !ok) throw new AppError("UNAUTHORIZED", "Incorrect email or password.");
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { user: toPublic(updated), sessionVersion: updated.sessionVersion, remember: Boolean(parsed.data.remember) };
}

export async function signOutEverywhere(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export async function changePassword(userId: string, input: unknown) {
  const parsed = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", firstIssue(parsed.error));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    throw new AppError("UNAUTHORIZED", "Current password is incorrect.");
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), sessionVersion: { increment: 1 } },
  });
  return { sessionVersion: updated.sessionVersion };
}

// ─── Sessions: HMAC-signed, HttpOnly cookie "<userId>.<version>.<expiresAt>.<sig>" ──
export const SESSION_COOKIE = "iia_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const sign = (value: string) => createHmac("sha256", env.auth.sessionSecret).update(value).digest("base64url");

export function createSessionToken(userId: string, version: number, ttlMs: number, now = Date.now()) {
  const payload = `${userId}.${version}.${now + ttlMs}`;
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined, now = Date.now()): { userId: string; version: number } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, version, exp, sig] = parts as [string, string, string, string];
  const expected = Buffer.from(sign(`${userId}.${version}.${exp}`));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  if (!(Number(exp) > now)) return null;
  return { userId, version: Number(version) };
}

/** Resolves the signed-in user from a session token, checking it hasn't been revoked. */
export async function userFromSession(token: string | undefined): Promise<PublicUser | null> {
  const s = parseSessionToken(token);
  if (!s) return null;
  const user = await prisma.user.findUnique({ where: { id: s.userId } });
  if (!user || user.sessionVersion !== s.version) return null;
  return toPublic(user);
}
