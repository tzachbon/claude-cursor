/**
 * Maps Claude Code conversation keys to Cursor agent chat IDs for --resume.
 */

import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AnthropicMessageRequest } from "../types/anthropic.ts";
import { appConfig } from "./config.ts";
import { createChildLogger } from "./logger.ts";

const logger = createChildLogger("session-store");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) {
    return db;
  }

  const path = appConfig.sessionStorePath;
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cursor_chat_sessions (
      conversation_key TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return db;
}

function serializeContent(content: AnthropicMessageRequest["messages"][number]["content"]): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

/**
 * Stable across turns: Claude session id, metadata user id, else hash of
 * system + first user message.
 */
export function deriveConversationKey(body: AnthropicMessageRequest): string {
  if (body.metadata?.session_id) {
    return `session:${body.metadata.session_id}`;
  }
  if (body.metadata?.user_id) {
    return `user:${body.metadata.user_id}`;
  }

  const digest = createHash("sha256");
  digest.update(JSON.stringify(body.system ?? null));
  const firstUser = body.messages.find((message) => message.role === "user");
  if (firstUser) {
    digest.update(serializeContent(firstUser.content));
  }
  return `hash:${digest.digest("hex").slice(0, 24)}`;
}

export function getChatId(conversationKey: string): string | null {
  const row = getDb()
    .prepare(
      "SELECT chat_id FROM cursor_chat_sessions WHERE conversation_key = ?"
    )
    .get(conversationKey) as { chat_id?: string } | undefined;
  return row?.chat_id ?? null;
}

export function setChatId(conversationKey: string, chatId: string): void {
  getDb()
    .prepare(
      `INSERT INTO cursor_chat_sessions (conversation_key, chat_id, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(conversation_key) DO UPDATE SET
         chat_id = excluded.chat_id,
         updated_at = excluded.updated_at`
    )
    .run(conversationKey, chatId, Date.now());
}

export function createChatId(): string {
  const chatId = execFileSync(appConfig.cursorAgentPath, ["create-chat"], {
    encoding: "utf8",
    timeout: 30000,
  }).trim();

  if (!chatId) {
    throw new Error("agent create-chat returned empty chat id");
  }

  return chatId;
}

export function ensureChatId(conversationKey: string): string | null {
  if (!appConfig.proactiveChatId) {
    return getChatId(conversationKey);
  }

  const existing = getChatId(conversationKey);
  if (existing) {
    return existing;
  }

  try {
    const chatId = createChatId();
    setChatId(conversationKey, chatId);
    logger.info({ conversationKey, chatId }, "Created Cursor chat for conversation");
    return chatId;
  } catch (err) {
    logger.warn(
      {
        conversationKey,
        error: err instanceof Error ? err.message : String(err),
      },
      "Failed to proactively create Cursor chat"
    );
    return null;
  }
}

export function defaultSessionStorePath(): string {
  return join(
    process.env.HOME || "/tmp",
    ".claude-cursor",
    "cursor-proxy-sessions.db"
  );
}
