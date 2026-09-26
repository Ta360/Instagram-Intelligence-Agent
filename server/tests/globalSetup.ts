import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

/** Spins up a disposable PostgreSQL for integration tests and applies the Prisma schema. */
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(serverRoot, ".data", "postgres-test");
const URL_ = "postgresql://iia:iia_test@localhost:5434/instagram_intel_test";

export default async function setup() {
  rmSync(dir, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "iia", password: "iia_test", port: 5434, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("instagram_intel_test");
  execSync("npx prisma db push --skip-generate", {
    cwd: serverRoot,
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: URL_ },
  });
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
