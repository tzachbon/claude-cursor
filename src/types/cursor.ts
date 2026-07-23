/**
 * Types for Cursor agent CLI output
 * Based on --output-format stream-json
 */

// Event types emitted by the agent CLI in stream-json mode
export type CursorEventType =
  | "text"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "error"
  | "done"
  | "session";

// Base event structure
export interface CursorBaseEvent {
  type: CursorEventType;
  timestamp?: number;
}

// Text content event (main response text)
export interface CursorTextEvent extends CursorBaseEvent {
  type: "text";
  content: string;
}

// Tool call event (when agent invokes a tool)
export interface CursorToolCallEvent extends CursorBaseEvent {
  type: "tool_call";
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
}

// Tool result event
export interface CursorToolResultEvent extends CursorBaseEvent {
  type: "tool_result";
  name: string;
  result?: unknown;
  error?: string;
}

// Thinking event (intermediate reasoning)
export interface CursorThinkingEvent extends CursorBaseEvent {
  type: "thinking";
  content: string;
}

// Error event
export interface CursorErrorEvent extends CursorBaseEvent {
  type: "error";
  message: string;
  code?: string;
}

// Done event (signals completion)
export interface CursorDoneEvent extends CursorBaseEvent {
  type: "done";
  totalTokens?: number;
}

export interface CursorSessionEvent extends CursorBaseEvent {
  type: "session";
  chatId: string;
}

// Union of all event types
export type CursorEvent =
  | CursorTextEvent
  | CursorToolCallEvent
  | CursorToolResultEvent
  | CursorThinkingEvent
  | CursorErrorEvent
  | CursorDoneEvent
  | CursorSessionEvent;

// CLI arguments configuration
export interface CursorCLIOptions {
  prompt: string;
  model?: string;
  mode?: "ask" | "plan";
  outputFormat?: "json" | "text" | "stream-json";
  streamPartialOutput?: boolean;
  force?: boolean;
  workingDirectory?: string;
  timeout?: number;
  resumeChatId?: string;
  onSpawnStarted?: () => void;
  onSpawnReady?: () => void;
  onFirstStdout?: () => void;
}

// Result from running the CLI
export interface CursorCLIResult {
  success: boolean;
  content: string;
  events: CursorEvent[];
  exitCode: number | null;
  error?: string;
}
