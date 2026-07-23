import { z } from "zod";

// OpenAI content part schemas (for multimodal messages)
export const TextContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const ImageUrlContentPartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(["auto", "low", "high"]).optional(),
  }),
});

export const ContentPartSchema = z.discriminatedUnion("type", [
  TextContentPartSchema,
  ImageUrlContentPartSchema,
]);

// Content can be a string or an array of content parts
export const MessageContentSchema = z.union([
  z.string(),
  z.array(ContentPartSchema),
]);

// Tool call schema for assistant messages
export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

// OpenAI Chat Message schemas - supporting all standard roles
export const SystemMessageSchema = z.object({
  role: z.literal("system"),
  content: MessageContentSchema,
  name: z.string().optional(),
});

export const DeveloperMessageSchema = z.object({
  role: z.literal("developer"),
  content: MessageContentSchema,
  name: z.string().optional(),
});

export const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: MessageContentSchema,
  name: z.string().optional(),
});

export const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: MessageContentSchema.nullable().optional(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
});

export const ToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: MessageContentSchema,
  tool_call_id: z.string(),
});

// Union of all message types
export const ChatMessageSchema = z.discriminatedUnion("role", [
  SystemMessageSchema,
  DeveloperMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
]);

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type MessageContent = z.infer<typeof MessageContentSchema>;
export type ContentPart = z.infer<typeof ContentPartSchema>;

// OpenAI Chat Completion Request
export const ChatCompletionRequestSchema = z.object({
  model: z.string().optional().default("opus-4.5-thinking"),
  messages: z.array(ChatMessageSchema).min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  user: z.string().optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

// OpenAI Chat Completion Response (non-streaming)
export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// OpenAI Streaming Chunk
export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
    };
    finish_reason: "stop" | "length" | "content_filter" | null;
  }>;
}

// Helper to create a unique completion ID
export function generateCompletionId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
