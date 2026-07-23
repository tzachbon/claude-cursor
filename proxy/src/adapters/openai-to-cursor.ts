/**
 * Convert OpenAI Chat Completion requests to Cursor CLI options
 */

import type { ChatCompletionRequest, MessageContent } from "../types/openai.ts";
import type { CursorCLIOptions } from "../types/cursor.ts";
import { appConfig } from "../utils/config.ts";

/**
 * Extract text content from a message content field
 * Handles both string and array formats
 */
function extractTextContent(content: MessageContent): string {
  // If it's a plain string, return it directly
  if (typeof content === "string") {
    return content;
  }

  // If it's an array of content parts, extract and join text parts
  const textParts: string[] = [];
  for (const part of content) {
    if (part.type === "text") {
      textParts.push(part.text);
    }
    // Note: image_url parts are ignored for now since the CLI doesn't support images
    // In the future, we could handle these differently
  }

  return textParts.join("\n");
}

/**
 * Convert OpenAI messages array to a single prompt string
 * Uses simple format without role prefixes to avoid confusing the agent CLI
 */
function messagesToPrompt(messages: ChatCompletionRequest["messages"]): string {
  // For single user message, just return the content directly
  if (messages.length === 1 && messages[0].role === "user") {
    return extractTextContent(messages[0].content);
  }

  // For conversations, use a simple format
  const parts: string[] = [];

  for (const msg of messages) {
    const content = msg.content;
    // Handle messages that may have null/undefined content (like assistant tool_calls)
    if (content === null || content === undefined) {
      continue;
    }
    const textContent = extractTextContent(content);
    if (msg.role === "system" || msg.role === "developer") {
      // Put system/developer message at the start as context
      parts.unshift(`Context: ${textContent}`);
    } else if (msg.role === "user") {
      parts.push(textContent);
    } else if (msg.role === "assistant") {
      parts.push(`Previous response: ${textContent}`);
    } else if (msg.role === "tool") {
      // Tool responses are context for the conversation
      parts.push(`Tool result: ${textContent}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * Map OpenAI model names to Cursor CLI model names
 * Returns undefined if the model should use the default
 */
function mapModel(openaiModel: string): string | undefined {
  // Common mappings - adjust based on what Cursor CLI supports
  const modelMap: Record<string, string | undefined> = {
    "gpt-4": "gpt-4",
    "gpt-4-turbo": "gpt-4",
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "gpt-3.5-turbo": "gpt-3.5-turbo",
    "claude-3-opus": "claude-3-opus",
    "claude-3-sonnet": "claude-3-sonnet",
    "claude-3-haiku": "claude-3-haiku",
    "cursor": undefined, // Use default
  };

  // Check for "cursor" explicitly - use default
  if (openaiModel === "cursor") {
    return undefined;
  }

  // Check for exact match
  if (openaiModel in modelMap && modelMap[openaiModel] !== undefined) {
    return modelMap[openaiModel];
  }

  // Check for prefix match (e.g., "gpt-4-0613" -> "gpt-4")
  for (const [prefix, cursorModel] of Object.entries(modelMap)) {
    if (cursorModel !== undefined && openaiModel.startsWith(prefix)) {
      return cursorModel;
    }
  }

  // Pass through unknown models - let Cursor CLI handle them
  return openaiModel;
}

/**
 * Convert an OpenAI Chat Completion request to Cursor CLI options
 */
export function openaiToCursor(
  request: ChatCompletionRequest,
  options: { streaming?: boolean } = {}
): CursorCLIOptions {
  const streaming = options.streaming ?? request.stream ?? false;
  const prompt = messagesToPrompt(request.messages);

  // Determine model
  let model = mapModel(request.model);
  if (!model && appConfig.cursorDefaultModel) {
    model = appConfig.cursorDefaultModel;
  }

  return {
    prompt,
    model,
    // Always use stream-json since the json format doesn't output until completion
    outputFormat: "stream-json",
    streamPartialOutput: streaming,
    force: true,
    timeout: appConfig.cursorTimeoutMs,
  };
}
