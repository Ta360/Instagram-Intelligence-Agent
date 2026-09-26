/**
 * Instagram username / User ID validation.
 *
 * Instagram usernames: 1–30 characters of letters, digits, "." and "_";
 * they cannot start or end with "." and cannot contain "..".
 * A purely numeric value of 5–20 digits is treated as an Instagram User ID.
 */
export type ParsedQuery =
  | { kind: "username"; value: string; raw: string }
  | { kind: "userId"; value: string; raw: string };

export type ValidationResult = { ok: true; query: ParsedQuery } | { ok: false; error: string };

const USERNAME_RE = /^[a-z0-9._]{1,30}$/;
const USER_ID_RE = /^\d{5,20}$/;

export function parseInstagramQuery(input: unknown): ValidationResult {
  if (typeof input !== "string") return { ok: false, error: "Enter an Instagram username or User ID." };
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Enter an Instagram username or User ID." };

  // Accept pasted profile URLs: https://www.instagram.com/<username>/
  let value = raw;
  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)\/?(?:[?#].*)?$/i);
  if (url) value = url[1]!;
  value = value.replace(/^@/, "").toLowerCase();

  if (USER_ID_RE.test(value)) return { ok: true, query: { kind: "userId", value, raw } };
  if (/^\d+$/.test(value)) return { ok: false, error: "A numeric Instagram User ID must be 5–20 digits." };
  if (value.length > 30) return { ok: false, error: "Instagram usernames are at most 30 characters." };
  if (!USERNAME_RE.test(value))
    return { ok: false, error: "Usernames may only contain letters, numbers, periods and underscores." };
  if (value.startsWith(".") || value.endsWith("."))
    return { ok: false, error: "Usernames cannot start or end with a period." };
  if (value.includes("..")) return { ok: false, error: "Usernames cannot contain consecutive periods." };

  return { ok: true, query: { kind: "username", value, raw } };
}

export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_COLOR_RE.test(v);
}
