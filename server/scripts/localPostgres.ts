/**
 * Local development PostgreSQL.
 *
 * Starts a real PostgreSQL 17 server from the `embedded-postgres` npm binaries
 * (no Docker or system install needed), creates the app database if missing,
 * applies the Prisma schema, then stays running until Ctrl+C.
 *
 * Only for local development. In production point DATABASE_URL at a managed
 * PostgreSQL instance and run `npm run db:push` (or migrations) instead.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseDir = path.join(serverRoot, ".data", "postgres");

const url = new URL(process.env.DATABASE_URL ?? "postgresql://iia:iia_local_dev@localhost:5433/instagram_intel");
const port = Number(url.port || 5433);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.replace(/^\//, "");

if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.log(`[db] DATABASE_URL points at ${url.hostname}; not starting a local PostgreSQL.`);
  process.exit(0);
}

// UTF-8 is required: real Instagram bios and captions contain emoji. Without these flags
// initdb on Windows defaults to WIN1252, which rejects them.
const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Ensures the app database exists with UTF-8 encoding; a legacy non-UTF-8 copy is renamed, never dropped. */
async function ensureUtf8Database() {
  const client = pg.getPgClient();
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = $1",
      [database],
    );
    const enc = rows[0]?.enc as string | undefined;
    if (enc === "UTF8") return;
    if (enc) {
      const legacy = `${database}_legacy_${enc.toLowerCase()}_${Date.now()}`;
      await client.query(`ALTER DATABASE ${quoteIdent(database)} RENAME TO ${quoteIdent(legacy)}`);
      console.log(`[db] Existing "${database}" used ${enc}; kept it as "${legacy}" and creating a UTF-8 database.`);
    }
    await client.query(
      `CREATE DATABASE ${quoteIdent(database)} ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    console.log(`[db] Created UTF-8 database "${database}"`);
  } finally {
    await client.end();
  }
}

async function main() {
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log("[db] Initialising local PostgreSQL cluster…");
    await pg.initialise();
  }
  await pg.start();
  await ensureUtf8Database();
  execSync("npx prisma db push --skip-generate", { cwd: serverRoot, stdio: "inherit" });
  console.log(`[db] PostgreSQL ready on localhost:${port}/${database}`);
}

async function shutdown() {
  console.log("[db] Stopping PostgreSQL…");
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch(async (err) => {
  console.error("[db] Failed to start local PostgreSQL:", err?.message ?? err);
  await pg.stop().catch(() => {});
  process.exit(1);
});

// Keep the process alive while the database runs.
setInterval(() => {}, 1 << 30);
