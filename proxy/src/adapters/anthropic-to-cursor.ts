/**
 * Convert Anthropic Messages API requests to Cursor CLI options
 */

import type {
  AnthropicContent,
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicMessageRequest,
} from "../types/anthropic.ts";
import type { CursorCLIOptions } from "../types/cursor.ts";
import { appConfig } from "../utils/config.ts";

export interface AnthropicToCursorOptions {
  streaming?: boolean;
  resumeChatId?: string | null;
}


function serializeToolUseBlock(block: Extract<AnthropicContentBlock, { type: "tool_use" }>): string {
  return `[Claude tool_use id=${block.id} name=${block.name} input=${JSON.stringify(block.input)}]`;
}

function serializeToolResultBlock(
  block: Extract<AnthropicContentBlock, { type: "tool_result" }>
): string {
  const content =
    typeof block.content === "string"
      ? block.content
      : block.content
          .map((part) =>
            part.type === "text"
              ? part.text
              : `[Claude tool_reference tool_name=${part.tool_name}]`
          )
          .join("\n");
  const errorSuffix = block.is_error ? " is_error=true" : "";
  return `[Claude tool_result tool_use_id=${block.tool_use_id}${errorSuffix}]\n${content}`;
}

function serializeContent(content: AnthropicContent): string {
  if (typeof content === "string") {
    return content;
  }

  const parts: string[] = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        parts.push(block.text);
        break;
      case "tool_use":
        parts.push(serializeToolUseBlock(block));
        break;
      case "tool_result":
        parts.push(serializeToolResultBlock(block));
        break;
      default:
        break;
    }
  }

  return parts.join("\n");
}

function extractSystemPrompt(system: AnthropicMessageRequest["system"]): string | undefined {
  if (!system) {
    return undefined;
  }

  if (typeof system === "string") {
    return system;
  }

  return system.map((block) => block.text).join("\n");
}

function formatMessage(message: AnthropicMessage): string {
  const serialized = serializeContent(message.content);
  if (message.role === "user") {
    return serialized;
  }
  return `Previous assistant response:\n${serialized}`;
}

function extractToolHistory(messages: AnthropicMessage[]): string[] {
  const parts: string[] = [];
  for (const message of messages) {
    if (typeof message.content === "string") {
      continue;
    }
    for (const block of message.content) {
      if (block.type === "tool_use") {
        parts.push(serializeToolUseBlock(block));
      } else if (block.type === "tool_result") {
        parts.push(serializeToolResultBlock(block));
      }
    }
  }
  return parts;
}

function messagesToPrompt(
  messages: AnthropicMessageRequest["messages"],
  systemPrompt?: string,
  resumeChatId?: string | null
): string {
  const parts: string[] = [];

  if (systemPrompt) {
    parts.push(`Context: ${systemPrompt}`);
  }

  if (resumeChatId) {
    const toolHistory = extractToolHistory(messages);
    if (toolHistory.length > 0) {
      parts.push(`Prior Claude tool history:\n${toolHistory.join("\n")}`);
    }
    const latest = messages[messages.length - 1];
    if (latest) {
      parts.push(formatMessage(latest));
    }
    return parts.join("\n\n");
  }

  if (messages.length === 1 && messages[0].role === "user") {
    const content = serializeContent(messages[0].content);
    if (systemPrompt) {
      return `${parts[0]}\n\n${content}`;
    }
    return content;
  }

  for (const message of messages) {
    parts.push(formatMessage(message));
  }

  return parts.join("\n\n");
}

function mapModel(anthropicModel: string): string | undefined {
  const modelMap: Record<string, string | undefined> = {
    "claude-3-opus-20240229": "opus-4.5",
    "claude-3-sonnet-20240229": "sonnet-4.5",
    "claude-3-haiku-20240307": "sonnet-4.5",
    "claude-3-5-sonnet-20240620": "sonnet-4.5",
    "claude-3-5-sonnet-20241022": "sonnet-4.5",
    "claude-3-5-haiku-20241022": "sonnet-4.5",
    "claude-sonnet-4-20250514": "sonnet-4.5",
    "claude-sonnet-4-5-20250514": "sonnet-4.5",
    "claude-opus-4-5-20250514": "opus-4.5",
    "claude-sonnet-4": "sonnet-4.5",
    "claude-sonnet-4-5": "sonnet-4.5",
    "claude-opus-4-5": "opus-4.5",
    "sonnet-4.5": "sonnet-4.5",
    "opus-4.5": "opus-4.5",
    auto: "auto",
  };

  if (anthropicModel in modelMap && modelMap[anthropicModel] !== undefined) {
    return modelMap[anthropicModel];
  }

  for (const [prefix, cursorModel] of Object.entries(modelMap)) {
    if (cursorModel && anthropicModel.startsWith(prefix)) {
      return cursorModel;
    }
  }

  return anthropicModel;
}

export function anthropicToCursor(
  request: AnthropicMessageRequest,
  options: AnthropicToCursorOptions = {}
): CursorCLIOptions {
  const streaming = options.streaming ?? request.stream ?? false;
  const systemPrompt = extractSystemPrompt(request.system);
  const resumeChatId = options.resumeChatId ?? null;
  const prompt = messagesToPrompt(request.messages, systemPrompt, resumeChatId);

  let model = mapModel(request.model);
  if (!model && appConfig.cursorDefaultModel) {
    model = appConfig.cursorDefaultModel;
  }

  const bridgeMode = process.env.CURSOR_BRIDGE_MODE?.toLowerCase();
  let mode: CursorCLIOptions["mode"];
  if (bridgeMode === "plan") {
    mode = "plan";
  } else if (bridgeMode === "ask") {
    mode = "ask";
  } else {
    mode = undefined;
  }

  return {
    prompt,
    model,
    mode,
    outputFormat: "stream-json",
    streamPartialOutput: streaming,
    force: true,
    timeout: appConfig.cursorTimeoutMs,
    resumeChatId: resumeChatId ?? undefined,
  };
}
