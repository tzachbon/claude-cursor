import { config } from "dotenv";
import { join } from "node:path";
import { ConfigurationError } from "./errors.ts";

// Load .env file
config();

export interface Config {
  port: number;
  host: string;
  logLevel: string;
  cursorAgentPath: string;
  cursorApiKey: string | undefined;
  cursorTimeoutMs: number;
  cursorDefaultModel: string | undefined;
  debugDumpOutput: boolean;
  sessionStorePath: string;
  cliWarmupOnStart: boolean;
  proactiveChatId: boolean;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(`Invalid number for ${key}: ${value}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

export function loadConfig(): Config {
  return {
    port: getEnvNumber("PORT", 8080),
    host: process.env.HOST || "127.0.0.1",
    logLevel: process.env.LOG_LEVEL || "info",
    cursorAgentPath: process.env.CURSOR_AGENT_PATH || "agent",
    cursorApiKey: process.env.CURSOR_API_KEY,
    cursorTimeoutMs: getEnvNumber("CURSOR_TIMEOUT_MS", 300000),
    cursorDefaultModel: process.env.CURSOR_DEFAULT_MODEL || "auto",
    debugDumpOutput: getEnvBoolean("DEBUG_DUMP_OUTPUT", false),
    sessionStorePath:
      process.env.CURSOR_SESSION_STORE_PATH ||
      join(process.env.HOME || "/tmp", ".claude-cursor", "cursor-proxy-sessions.db"),
    cliWarmupOnStart: getEnvBoolean("CURSOR_CLI_WARMUP", false),
    proactiveChatId: getEnvBoolean("CURSOR_PROACTIVE_CHAT", true),
  };
}

export const appConfig = loadConfig();
