/**
 * Convert Cursor CLI events to Anthropic Messages API response format
 */

import type { CursorEvent } from "../types/cursor.ts";
import type {
  AnthropicMessageResponse,
  AnthropicMessageStartEvent,
  AnthropicContentBlockStartEvent,
  AnthropicContentBlockDeltaEvent,
  AnthropicContentBlockStopEvent,
  AnthropicMessageDeltaEvent,
  AnthropicMessageStopEvent,
  AnthropicStreamEvent,
  AnthropicErrorStreamEvent,
  AnthropicContentBlock,
} from "../types/anthropic.ts";
import { generateMessageId } from "../types/anthropic.ts";
import { createChildLogger } from "../utils/logger.ts";

const logger = createChildLogger("cursor-to-anthropic");

export function formatAnthropicSSE(event: AnthropicStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function createMessageStartEvent(
  messageId: string,
  model: string
): AnthropicMessageStartEvent {
  return {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
  };
}

function createContentBlockStartEvent(index: number): AnthropicContentBlockStartEvent {
  return {
    type: "content_block_start",
    index,
    content_block: {
      type: "text",
      text: "",
    },
  };
}

function createToolUseBlockStartEvent(
  index: number,
  id: string,
  name: string
): AnthropicContentBlockStartEvent {
  return {
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id,
      name,
      input: {},
    },
  };
}

function createContentBlockDeltaEvent(
  index: number,
  text: string
): AnthropicContentBlockDeltaEvent {
  return {
    type: "content_block_delta",
    index,
    delta: {
      type: "text_delta",
      text,
    },
  };
}

function createToolInputDeltaEvent(
  index: number,
  input: Record<string, unknown>
): AnthropicContentBlockDeltaEvent {
  return {
    type: "content_block_delta",
    index,
    delta: {
      type: "input_json_delta",
      partial_json: JSON.stringify(input),
    },
  };
}

function createContentBlockStopEvent(index: number): AnthropicContentBlockStopEvent {
  return {
    type: "content_block_stop",
    index,
  };
}

function createMessageDeltaEvent(
  stopReason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use",
  outputTokens: number
): AnthropicMessageDeltaEvent {
  return {
    type: "message_delta",
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
    },
    usage: {
      output_tokens: outputTokens,
    },
  };
}

function createMessageStopEvent(): AnthropicMessageStopEvent {
  return {
    type: "message_stop",
  };
}

function createErrorStreamEvent(message: string): AnthropicErrorStreamEvent {
  return {
    type: "error",
    error: {
      type: "api_error",
      message,
    },
  };
}

export async function* cursorEventsToAnthropicSSE(
  events: AsyncIterable<CursorEvent>,
  model: string,
  requestId: string = "unknown"
): AsyncGenerator<string, void, unknown> {
  const messageId = generateMessageId();
  let textBlockIndex: number | null = null;
  let nextBlockIndex = 0;
  let hasToolUse = false;
  let estimatedOutputTokens = 0;

  yield formatAnthropicSSE(createMessageStartEvent(messageId, model));

  for await (const event of events) {
    switch (event.type) {
      case "text":
        if (event.content) {
          if (textBlockIndex === null) {
            textBlockIndex = nextBlockIndex++;
            yield formatAnthropicSSE(
              createContentBlockStartEvent(textBlockIndex)
            );
          }

          yield formatAnthropicSSE(
            createContentBlockDeltaEvent(textBlockIndex, event.content)
          );
          estimatedOutputTokens += Math.ceil(event.content.length / 4);
        }
        break;

      case "thinking":
        break;

      case "tool_call":
        if (textBlockIndex !== null) {
          yield formatAnthropicSSE(
            createContentBlockStopEvent(textBlockIndex)
          );
          textBlockIndex = null;
        }
        {
          const toolIndex = nextBlockIndex++;
          yield formatAnthropicSSE(
            createToolUseBlockStartEvent(toolIndex, event.id, event.name)
          );
          yield formatAnthropicSSE(
            createToolInputDeltaEvent(toolIndex, event.arguments ?? {})
          );
          yield formatAnthropicSSE(createContentBlockStopEvent(toolIndex));
          estimatedOutputTokens += Math.ceil(
            JSON.stringify(event.arguments ?? {}).length / 4
          );
          hasToolUse = true;
        }
        break;

      case "tool_result":
        logger.warn(
          {
            requestId,
            eventType: event.type,
            name: "name" in event ? event.name : undefined,
          },
          "Suppressed Cursor-side tool event"
        );
        break;

      case "session":
        break;

      case "error":
        if (event.message) {
          yield formatAnthropicSSE(createErrorStreamEvent(event.message));
        }
        break;

      case "done":
        if (textBlockIndex !== null) {
          yield formatAnthropicSSE(
            createContentBlockStopEvent(textBlockIndex)
          );
        }

        yield formatAnthropicSSE(
          createMessageDeltaEvent(
            hasToolUse ? "tool_use" : "end_turn",
            estimatedOutputTokens
          )
        );
        yield formatAnthropicSSE(createMessageStopEvent());
        return;
    }
  }

  if (textBlockIndex !== null) {
    yield formatAnthropicSSE(createContentBlockStopEvent(textBlockIndex));
  }
  yield formatAnthropicSSE(
    createMessageDeltaEvent(
      hasToolUse ? "tool_use" : "end_turn",
      estimatedOutputTokens
    )
  );
  yield formatAnthropicSSE(createMessageStopEvent());
}

export async function cursorEventsToAnthropicResponse(
  events: AsyncIterable<CursorEvent>,
  model: string,
  requestId: string = "unknown"
): Promise<AnthropicMessageResponse> {
  const messageId = generateMessageId();
  const content: AnthropicContentBlock[] = [];
  let text = "";
  let hasToolUse = false;

  const flushText = () => {
    if (!text) return;
    content.push({ type: "text", text });
    text = "";
  };

  for await (const event of events) {
    switch (event.type) {
      case "text":
        if (event.content) {
          text += event.content;
        }
        break;

      case "tool_call":
        flushText();
        content.push({
          type: "tool_use",
          id: event.id,
          name: event.name,
          input: event.arguments ?? {},
        });
        hasToolUse = true;
        break;

      case "tool_result":
        logger.warn(
          {
            requestId,
            eventType: event.type,
            name: "name" in event ? event.name : undefined,
          },
          "Suppressed Cursor-side tool event"
        );
        break;

      case "error":
        if (event.message) {
          text += `\n[Error: ${event.message}]`;
        }
        break;

      case "done":
        break;
    }
  }

  flushText();
  if (content.length === 0) content.push({ type: "text", text: "" });
  const estimatedOutputTokens = Math.ceil(JSON.stringify(content).length / 4);

  return {
    id: messageId,
    type: "message",
    role: "assistant",
    content: content.filter(
      (block): block is Extract<
        AnthropicContentBlock,
        { type: "text" | "tool_use" }
      > => block.type === "text" || block.type === "tool_use"
    ),
    model,
    stop_reason: hasToolUse ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: estimatedOutputTokens,
    },
  };
}
