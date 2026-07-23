/**
 * Entry point for claude-cursor
 * OpenAI-compatible API proxy wrapping Cursor agent CLI
 */

import { logger } from "./utils/logger.ts";
import { createServer, startServer, stopServer } from "./server.ts";

async function main() {
  logger.info("Starting claude-cursor...");

  const server = await createServer();

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");
    await stopServer(server);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled rejection");
    process.exit(1);
  });

  await startServer(server);
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start application");
  process.exit(1);
});
