/**
 * Client-side mirror of server/src/lib/validation.ts for instant feedback.
 * The server re-validates every request and is authoritative.
 */
export type ClientValidation = { ok: true; value: string; kind: "username" | "userId" } | { ok: false; error: string };

export function validateInstagramQuery(input: string): ClientValidation {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Enter an Instagram username or User ID." };
  let value = raw;
  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)\/?(?:[?#].*)?$/i);
  if (url) value = url[1]!;
  value = value.replace(/^@/, "").toLowerCase();
  if (/^\d{5,20}$/.test(value)) return { ok: true, value, kind: "userId" };
  if (/^\d+$/.test(value)) return { ok: false, error: "A numeric Instagram User ID must be 5–20 digits." };
  if (value.length > 30) return { ok: false, error: "Instagram usernames are at most 30 characters." };
  if (!/^[a-z0-9._]{1,30}$/.test(value)) return { ok: false, error: "Usernames may only contain letters, numbers, periods and underscores." };
  if (value.startsWith(".") || value.endsWith(".")) return { ok: false, error: "Usernames cannot start or end with a period." };
  if (value.includes("..")) return { ok: false, error: "Usernames cannot contain consecutive periods." };
  return { ok: true, value, kind: "username" };
}

export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
