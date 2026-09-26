import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createSessionToken, hashPassword, parseSessionToken, verifyPassword } from "../src/services/authService.js";

const app = createApp();
const OWNER = { name: "Owner", email: "Owner@Example.com", password: "correct horse 42" };

beforeEach(async () => {
  await prisma.$executeRawUnsafe("TRUNCATE users RESTART IDENTITY CASCADE");
});
afterAll(async () => {
  await prisma.$disconnect();
});

const cookieOf = (res: request.Response) =>
  ((res.headers["set-cookie"] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith("iia_session=")) ?? "";

describe("password hashing", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashPassword("abc12345");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("abc12345");
    expect(await verifyPassword("abc12345", h)).toBe(true);
    expect(await verifyPassword("wrong123", h)).toBe(false);
    expect(await hashPassword("abc12345")).not.toBe(h); // random salt
  });
});

describe("session tokens", () => {
  it("rejects tampered and expired tokens", () => {
    const t = createSessionToken("user1", 0, 1000, 0);
    expect(parseSessionToken(t, 10)).toEqual({ userId: "user1", version: 0 });
    expect(parseSessionToken(t, 5000)).toBeNull(); // expired
    expect(parseSessionToken(t.replace("user1", "user2"), 10)).toBeNull(); // tampered
    expect(parseSessionToken("garbage", 10)).toBeNull();
    expect(parseSessionToken(undefined, 10)).toBeNull();
  });
});

describe("dashboard access control", () => {
  it("blocks every dashboard API route without a session but keeps health public", async () => {
    for (const path of ["/api/analytics/summary", "/api/search-history", "/api/system/status", "/api/saved-profiles"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    }
    expect((await request(app).post("/api/search").send({ query: "x" })).status).toBe(401);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  it("reports status: signed out, sign-up open for the first account", async () => {
    const res = await request(app).get("/api/auth/status");
    expect(res.body).toEqual({ authenticated: false, user: null, signupOpen: true });
  });
});

describe("sign up / sign in / sign out", () => {
  it("creates the first account, signs in, and never returns the password hash", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/signup").send(OWNER);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "owner@example.com", name: "Owner" });
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|passwordHash|correct horse/);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const status = await agent.get("/api/auth/status");
    expect(status.body).toMatchObject({ authenticated: true, signupOpen: false, user: { email: "owner@example.com" } });
    expect((await agent.get("/api/analytics/summary")).status).toBe(200);

    const stored = await prisma.user.findFirstOrThrow();
    expect(stored.passwordHash).not.toContain("correct horse");

    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/analytics/summary")).status).toBe(401);
  });

  it("closes sign-up after the first account (unless ALLOW_SIGNUP=true)", async () => {
    await request(app).post("/api/auth/signup").send(OWNER);
    const second = await request(app)
      .post("/api/auth/signup")
      .send({ name: "Intruder", email: "x@example.com", password: "password123" });
    expect(second.status).toBe(403);
    expect(second.body.error.code).toBe("FORBIDDEN");
    expect(await prisma.user.count()).toBe(1);
  });

  it("validates sign-up input", async () => {
    const bad = [
      { name: "", email: "a@b.co", password: "abcdefg1" },
      { name: "A", email: "not-an-email", password: "abcdefg1" },
      { name: "A", email: "a@b.co", password: "short1" },
      { name: "A", email: "a@b.co", password: "lettersonly" },
    ];
    for (const body of bad) {
      const res = await request(app).post("/api/auth/signup").send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("signs in case-insensitively and uses one message for wrong email or password", async () => {
    await request(app).post("/api/auth/signup").send(OWNER);
    const ok = await request(app).post("/api/auth/login").send({ email: "OWNER@example.com", password: OWNER.password, remember: true });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toMatch(/Max-Age=2592000/); // remember me = 30 days

    const wrongPw = await request(app).post("/api/auth/login").send({ email: OWNER.email, password: "nope12345" });
    const noUser = await request(app).post("/api/auth/login").send({ email: "ghost@example.com", password: "nope12345" });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(noUser.body.error.message);
  });

  it("change password revokes other sessions; sign-out-everywhere revokes all", async () => {
    const a = request.agent(app);
    const b = request.agent(app);
    await a.post("/api/auth/signup").send(OWNER);
    await b.post("/api/auth/login").send({ email: OWNER.email, password: OWNER.password });
    expect((await b.get("/api/analytics/summary")).status).toBe(200);

    const wrong = await a.post("/api/auth/change-password").send({ currentPassword: "bad", newPassword: "newpass123" });
    expect(wrong.status).toBe(401);
    const changed = await a.post("/api/auth/change-password").send({ currentPassword: OWNER.password, newPassword: "newpass123" });
    expect(changed.status).toBe(200);
    expect((await a.get("/api/analytics/summary")).status).toBe(200); // this browser stays signed in
    expect((await b.get("/api/analytics/summary")).status).toBe(401); // other session revoked
    expect((await request(app).post("/api/auth/login").send({ email: OWNER.email, password: "newpass123" })).status).toBe(200);

    await a.post("/api/auth/logout-all");
    expect((await a.get("/api/analytics/summary")).status).toBe(401);
  });
});
