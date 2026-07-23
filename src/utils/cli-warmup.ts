/**
 * Optional startup warmup for the Cursor agent CLI.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { appConfig } from "./config.ts";
import { createChildLogger } from "./logger.ts";

const logger = createChildLogger("cli-warmup");

const DEFAULT_BRIDGE_WORKSPACE =
  process.env.CURSOR_BRIDGE_WORKSPACE ||
  join(process.env.HOME || "/tmp", ".claude-cursor", "bridge-workspace");

let warmupStarted = false;

export function startCliWarmup(): void {
  if (!appConfig.cliWarmupOnStart || warmupStarted) {
    return;
  }

  warmupStarted = true;

  if (!existsSync(DEFAULT_BRIDGE_WORKSPACE)) {
    mkdirSync(DEFAULT_BRIDGE_WORKSPACE, { recursive: true });
  }

  logger.info("Starting background CLI warmup");

  const child = spawn(
    appConfig.cursorAgentPath,
    [
      "-p",
      "Reply with exactly: warmup-ok",
      "--output-format",
      "stream-json",
      "--force",
      "--trust",
      "--workspace",
      DEFAULT_BRIDGE_WORKSPACE,
    ],
    {
      cwd: DEFAULT_BRIDGE_WORKSPACE,
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    }
  );

  child.unref();

  child.on("error", (err) => {
    logger.warn({ error: err.message }, "CLI warmup failed to start");
  });

  child.on("close", (code) => {
    logger.info({ code }, "CLI warmup finished");
  });
}
