/**
 * Anthropic Messages API types
 * Based on https://docs.anthropic.com/en/api/messages
 */

import { z } from "zod";

// Content block types for Anthropic messages
export const AnthropicTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const AnthropicImageSourceSchema = z.object({
  type: z.literal("base64"),
  media_type: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
  data: z.string(),
});

export const AnthropicImageBlockSchema = z.object({
  type: z.literal("image"),
  source: AnthropicImageSourceSchema,
});

export const AnthropicToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});

export const AnthropicToolReferenceBlockSchema = z.object({
  type: z.literal("tool_reference"),
  tool_name: z.string(),
});

export const AnthropicToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.union([
    z.string(),
    z.array(
      z.discriminatedUnion("type", [
        AnthropicTextBlockSchema,
        AnthropicToolReferenceBlockSchema,
      ])
    ),
  ]),
  is_error: z.boolean().optional(),
});

export const AnthropicContentBlockSchema = z.discriminatedUnion("type", [
  AnthropicTextBlockSchema,
  AnthropicImageBlockSchema,
  AnthropicToolUseBlockSchema,
  AnthropicToolResultBlockSchema,
]);

// Content can be a string or array of content blocks
export const AnthropicContentSchema = z.union([
  z.string(),
  z.array(AnthropicContentBlockSchema),
]);

// Message schema (user or assistant)
export const AnthropicMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: AnthropicContentSchema,
});

// System prompt can be a string or array of text blocks
export const AnthropicSystemSchema = z.union([
  z.string(),
  z.array(AnthropicTextBlockSchema),
]).optional();

// Request schema for POST /v1/messages
export const AnthropicMessageRequestSchema = z.object({
  model: z.string(),
  max_tokens: z.number().positive(),
  messages: z.array(AnthropicMessageSchema).min(1),
  system: AnthropicSystemSchema,
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().positive().optional(),
  stop_sequences: z.array(z.string()).optional(),
  tools: z.array(z.record(z.unknown())).optional(),
  tool_choice: z.unknown().optional(),
  metadata: z.object({
    user_id: z.string().optional(),
    session_id: z.string().optional(),
  }).optional(),
});

export type AnthropicTextBlock = z.infer<typeof AnthropicTextBlockSchema>;
export type AnthropicImageBlock = z.infer<typeof AnthropicImageBlockSchema>;
export type AnthropicToolUseBlock = z.infer<typeof AnthropicToolUseBlockSchema>;
export type AnthropicToolReferenceBlock = z.infer<typeof AnthropicToolReferenceBlockSchema>;
export type AnthropicToolResultBlock = z.infer<typeof AnthropicToolResultBlockSchema>;
export type AnthropicContentBlock = z.infer<typeof AnthropicContentBlockSchema>;
export type AnthropicContent = z.infer<typeof AnthropicContentSchema>;
export type AnthropicMessage = z.infer<typeof AnthropicMessageSchema>;
export type AnthropicMessageRequest = z.infer<typeof AnthropicMessageRequestSchema>;

// Response types (non-streaming)
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

// Streaming event types
export type AnthropicStreamEventType =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop"
  | "ping"
  | "error";

export interface AnthropicMessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    content: [];
    model: string;
    stop_reason: null;
    stop_sequence: null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export interface AnthropicContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block:
    | {
        type: "text";
        text: "";
      }
    | {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, never>;
      };
}

export interface AnthropicContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta:
    | {
        type: "text_delta";
        text: string;
      }
    | {
        type: "input_json_delta";
        partial_json: string;
      };
}

export interface AnthropicContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface AnthropicMessageDeltaEvent {
  type: "message_delta";
  delta: {
    stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
    stop_sequence: string | null;
  };
  usage: {
    output_tokens: number;
  };
}

export interface AnthropicMessageStopEvent {
  type: "message_stop";
}

export interface AnthropicPingEvent {
  type: "ping";
}

export interface AnthropicErrorStreamEvent {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

export type AnthropicStreamEvent =
  | AnthropicMessageStartEvent
  | AnthropicContentBlockStartEvent
  | AnthropicContentBlockDeltaEvent
  | AnthropicContentBlockStopEvent
  | AnthropicMessageDeltaEvent
  | AnthropicMessageStopEvent
  | AnthropicPingEvent
  | AnthropicErrorStreamEvent;

// Error response type
export interface AnthropicErrorResponse {
  type: "error";
  error: {
    type: "invalid_request_error" | "authentication_error" | "permission_error" | "not_found_error" | "rate_limit_error" | "api_error" | "overloaded_error";
    message: string;
  };
}

// Helper to generate a message ID
export function generateMessageId(): string {
  return `msg_${Date.now()}${Math.random().toString(36).substring(2, 9)}`;
}
