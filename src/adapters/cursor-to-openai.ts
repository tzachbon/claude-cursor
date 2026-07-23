/**
 * Convert Cursor CLI events to OpenAI-compatible response format
 */

import type { CursorEvent } from "../types/cursor.ts";
import type {
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "../types/openai.ts";
import { generateCompletionId } from "../types/openai.ts";

/**
 * Create an OpenAI streaming chunk from a text delta
 */
export function createStreamChunk(
  content: string,
  completionId: string,
  model: string,
  isFirst: boolean = false
): ChatCompletionChunk {
  return {
    id: completionId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: isFirst
          ? { role: "assistant", content }
          : { content },
        finish_reason: null,
      },
    ],
  };
}

/**
 * Create the final streaming chunk with finish_reason
 */
export function createFinalChunk(
  completionId: string,
  model: string,
  finishReason: "stop" | "length" | "content_filter" = "stop"
): ChatCompletionChunk {
  return {
    id: completionId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: finishReason,
      },
    ],
  };
}

/**
 * Format a chunk as a Server-Sent Event
 */
export function formatSSE(chunk: ChatCompletionChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * The final SSE marker
 */
export const SSE_DONE = "data: [DONE]\n\n";

/**
 * Async generator that converts Cursor events to OpenAI SSE chunks
 */
export async function* cursorEventsToSSE(
  events: AsyncIterable<CursorEvent>,
  model: string
): AsyncGenerator<string, void, unknown> {
  const completionId = generateCompletionId();
  let isFirst = true;
  let hasError = false;

  for await (const event of events) {
    switch (event.type) {
      case "text":
        // Yield text content as streaming chunks
        if (event.content) {
          const chunk = createStreamChunk(
            event.content,
            completionId,
            model,
            isFirst
          );
          isFirst = false;
          yield formatSSE(chunk);
        }
        break;

      case "thinking":
        // Optionally include thinking as content (can be toggled)
        // For now, we skip thinking events to match standard OpenAI behavior
        break;

      case "tool_call":
        // Tool calls could be converted to function_call format
        // For now, we skip them for simplicity
        break;

      case "tool_result":
        // Skip tool results for now
        break;

      case "error":
        hasError = true;
        // Include error message in the stream
        if (event.message) {
          const errorChunk = createStreamChunk(
            `\n[Error: ${event.message}]`,
            completionId,
            model,
            isFirst
          );
          isFirst = false;
          yield formatSSE(errorChunk);
        }
        break;

      case "done":
        // Yield final chunk with finish_reason
        const finalChunk = createFinalChunk(
          completionId,
          model,
          hasError ? "content_filter" : "stop"
        );
        yield formatSSE(finalChunk);
        yield SSE_DONE;
        return;
    }
  }

  // If we exit the loop without a done event, still send final markers
  const finalChunk = createFinalChunk(completionId, model, "stop");
  yield formatSSE(finalChunk);
  yield SSE_DONE;
}

/**
 * Collect all Cursor events and convert to a non-streaming response
 */
export async function cursorEventsToResponse(
  events: AsyncIterable<CursorEvent>,
  model: string
): Promise<ChatCompletionResponse> {
  const completionId = generateCompletionId();
  const contentParts: string[] = [];
  let hasError = false;

  for await (const event of events) {
    switch (event.type) {
      case "text":
        if (event.content) {
          contentParts.push(event.content);
        }
        break;

      case "error":
        hasError = true;
        if (event.message) {
          contentParts.push(`\n[Error: ${event.message}]`);
        }
        break;

      case "done":
        // Processing complete
        break;
    }
  }

  const content = contentParts.join("");

  return {
    id: completionId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: hasError ? "content_filter" : "stop",
      },
    ],
    // Note: We don't have token usage info from the CLI
    usage: undefined,
  };
}
