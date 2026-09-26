/** Minimal structured logger. Redacts anything that looks like a credential. */
const SECRET_PATTERNS = [
  /(access_token|appsecret_proof|client_secret|api[_-]?key|password)=([^&\s"]+)/gi,
  /Bearer\s+[A-Za-z0-9._\-]+/g,
  /sk-[A-Za-z0-9_\-]{10,}/g,
  /EAA[A-Za-z0-9]{20,}/g,
];

export function redact(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, k) => (typeof k === "string" && m.includes("=") ? `${k}=[REDACTED]` : "[REDACTED]"));
  }
  return out;
}

function write(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level === "info") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta ?? {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(redact(line));
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
