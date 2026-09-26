import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { getInstagramProvider } from "./services/instagram/instagramClient.js";

const app = createApp();
const provider = getInstagramProvider();

const server = app.listen(env.port, () => {
  logger.info("server.started", {
    url: `http://localhost:${env.port}`,
    instagramMode: provider.dataSource,
    provider: provider.name,
    ai: env.openai.apiKey ? "openai" : "local",
    auth: env.auth.password ? "password" : "open",
  });
  if (provider.dataSource === "mock") console.log("⚠  INSTAGRAM_API_MODE=mock — serving DEMO DATA");
});

async function shutdown() {
  server.close();
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
