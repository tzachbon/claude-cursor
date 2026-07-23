import { runCursorCLI, runCursorCLICollected } from "./cursor-cli.ts";
import type { CursorCLIOptions, CursorEvent } from "../types/cursor.ts";

export function getUpstreamState(): {
  configuredMode: "cli";
  activeMode: "cli";
} {
  return {
    configuredMode: "cli",
    activeMode: "cli",
  };
}

export async function* runCursor(
  options: CursorCLIOptions,
  requestId: string = "unknown"
): AsyncGenerator<CursorEvent, void, unknown> {
  yield* runCursorCLI(options, requestId);
}

export async function runCursorCollected(
  options: CursorCLIOptions,
  requestId: string = "unknown"
): Promise<{ content: string; events: CursorEvent[] }> {
  return runCursorCLICollected(options, requestId);
}

export async function cleanup(): Promise<void> {
  // Each CLI request owns and closes its child process.
}

export { runCursorCLI, runCursorCLICollected } from "./cursor-cli.ts";
export type { CursorCLIOptions, CursorEvent } from "../types/cursor.ts";
