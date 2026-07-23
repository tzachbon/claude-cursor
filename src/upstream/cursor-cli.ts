import { spawn, ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createChildLogger } from "../utils/logger.ts";
import { CursorCLIError, TimeoutError } from "../utils/errors.ts";
import { appConfig } from "../utils/config.ts";
import type {
  CursorCLIOptions,
  CursorEvent,
  CursorTextEvent,
  CursorErrorEvent,
  CursorDoneEvent,
  CursorSessionEvent,
} from "../types/cursor.ts";

const logger = createChildLogger("cursor-cli");

const DEFAULT_BRIDGE_WORKSPACE =
  process.env.CURSOR_BRIDGE_WORKSPACE ||
  join(process.env.HOME || "/tmp", ".claude-cursor", "bridge-workspace");

/**
 * Parse a line of stream-json output from the agent CLI
 * @param line - The line to parse
 * @param isStreaming - Whether we're in streaming mode (with --stream-partial-output flag)
 */
export function parseCursorStreamJsonLine(
  line: string,
  isStreaming: boolean = false
): CursorEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);

    // Handle various event formats from the CLI
    if (typeof parsed === "object" && parsed !== null) {
      // Handle agent CLI format with type field
      if (parsed.type) {
        switch (parsed.type) {
          case "assistant":
            // Extract text from assistant message: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
            // Cursor identifies full-text snapshots with model_call_id. It emits a
            // final full-text copy without timestamp_ms. Drop both structurally,
            // never by comparing text, because repeated tokens are valid output.
            const isSnapshot = Boolean(parsed.model_call_id) || !parsed.timestamp_ms;
            if (isStreaming && isSnapshot) {
              return null;
            }
            if (!isStreaming && parsed.timestamp_ms) {
              // Non-streaming: keep only the final consolidated assistant message
              return null;
            }
            if (parsed.message?.content) {
              const textParts: string[] = [];
              for (const part of parsed.message.content) {
                if (part.type === "text" && part.text) {
                  textParts.push(part.text);
                }
              }
              if (textParts.length > 0) {
                return {
                  type: "text",
                  content: textParts.join(""),
                } as CursorTextEvent;
              }
            }
            return null;

          case "result":
            // Result event signals completion: {"type":"result","subtype":"success","result":"..."}
            if (parsed.subtype === "success") {
              return { type: "done" } as CursorDoneEvent;
            } else if (parsed.subtype === "error" || parsed.is_error) {
              return {
                type: "error",
                message: parsed.result || "Unknown error",
              } as CursorErrorEvent;
            }
            return { type: "done" } as CursorDoneEvent;

          case "thinking":
            // Thinking events - could expose these but for now skip
            return {
              type: "thinking",
              content: parsed.text || "",
            };

          case "system":
            if (parsed.session_id || parsed.sessionId || parsed.chat_id || parsed.chatId) {
              const chatId = String(
                parsed.session_id || parsed.sessionId || parsed.chat_id || parsed.chatId
              );
              return {
                type: "session",
                chatId,
              } as CursorSessionEvent;
            }
            return null;

          case "user":
            return null;

          case "text":
            return parsed as CursorTextEvent;

          case "error":
            return parsed as CursorErrorEvent;

          case "done":
            return parsed as CursorDoneEvent;

          default:
            // Unknown type with content - return as text
            if (parsed.content !== undefined) {
              return {
                type: "text",
                content: String(parsed.content),
              } as CursorTextEvent;
            }
            return null;
        }
      }

      // Handle content/text variations (legacy format)
      if (parsed.content !== undefined) {
        return {
          type: "text",
          content: String(parsed.content),
        } as CursorTextEvent;
      }

      if (parsed.text !== undefined) {
        return {
          type: "text",
          content: String(parsed.text),
        } as CursorTextEvent;
      }

      // Handle delta format (similar to OpenAI streaming)
      if (parsed.delta?.content !== undefined) {
        return {
          type: "text",
          content: String(parsed.delta.content),
        } as CursorTextEvent;
      }

      // Handle error format
      if (parsed.error) {
        return {
          type: "error",
          message: typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error),
        } as CursorErrorEvent;
      }

      // Handle done/finish events
      if (parsed.done === true || parsed.finished === true) {
        return {
          type: "done",
        } as CursorDoneEvent;
      }
    }

    // If we can't parse it as a known format, skip it
    return null;
  } catch {
    // Not valid JSON - skip it
    return null;
  }
}

/**
 * Build CLI arguments from options
 */
function buildCliArgs(options: CursorCLIOptions): string[] {
  const args: string[] = ["-p", options.prompt];

  // Output format
  const format = options.outputFormat || "stream-json";
  args.push("--output-format", format);

  // Model selection
  if (options.model) {
    args.push("--model", options.model);
  }

  // Mode selection
  if (options.mode) {
    args.push("--mode", options.mode);
  }

  // Stream partial output for streaming responses
  if (options.streamPartialOutput) {
    args.push("--stream-partial-output");
  }

  // Force flag for non-interactive mode
  if (options.force !== false) {
    args.push("--force");
  }

  if (options.resumeChatId) {
    args.push("--resume", options.resumeChatId);
  }

  // Keep Cursor agent out of the user's working tree. Claude Code owns tools locally.
  const workspace = options.workingDirectory || DEFAULT_BRIDGE_WORKSPACE;
  args.push("--workspace", workspace);
  args.push("--trust");

  return args;
}

/**
 * Create a debug dump file for raw CLI output
 */
function createDebugDump(requestId: string): ReturnType<typeof createWriteStream> | null {
  if (!appConfig.debugDumpOutput) return null;

  const debugDir = join(process.cwd(), "debug");
  if (!existsSync(debugDir)) {
    mkdirSync(debugDir, { recursive: true });
  }

  const filename = `${requestId}-${Date.now()}.log`;
  const filepath = join(debugDir, filename);
  logger.debug({ filepath }, "Creating debug dump file");
  return createWriteStream(filepath);
}

/**
 * Async generator that spawns the agent CLI and yields events
 */
export async function* runCursorCLI(
  options: CursorCLIOptions,
  requestId: string = "unknown"
): AsyncGenerator<CursorEvent, void, unknown> {
  const args = buildCliArgs(options);
  const timeout = options.timeout || appConfig.cursorTimeoutMs;
  const workspace = options.workingDirectory || DEFAULT_BRIDGE_WORKSPACE;
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
  }

  logger.info(
    {
      timeout,
      requestId,
      model: options.model,
      streaming: options.streamPartialOutput ?? false,
      resumeChatId: options.resumeChatId,
    },
    "Spawning agent CLI"
  );

  options.onSpawnStarted?.();

  const debugDump = createDebugDump(requestId);
  let childProcess: ChildProcess | null = null;
  let killed = false;
  let timeoutHandle: NodeJS.Timeout | null = null;

  // Set up environment
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (appConfig.cursorApiKey) {
    env.CURSOR_API_KEY = appConfig.cursorApiKey;
  }

  try {
    childProcess = spawn(appConfig.cursorAgentPath, args, {
      cwd: options.workingDirectory || DEFAULT_BRIDGE_WORKSPACE,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    await new Promise<void>((resolve, reject) => {
      childProcess!.once("spawn", () => {
        options.onSpawnReady?.();
        resolve();
      });
      childProcess!.once("error", (err) => {
        reject(
          err.message.includes("ENOENT")
            ? new CursorCLIError(
                "Cursor agent CLI not found. Install 'agent' on PATH or set CURSOR_AGENT_PATH."
              )
            : err
        );
      });
    });

    if (!childProcess.stdout || !childProcess.stderr) {
      throw new CursorCLIError("Failed to capture CLI output streams");
    }

    childProcess.stdin?.end();

    // Set up timeout
    timeoutHandle = setTimeout(() => {
      if (childProcess && !killed) {
        logger.warn({ requestId }, "Killing agent process due to timeout");
        killed = true;
        childProcess.kill("SIGTERM");
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (childProcess && !childProcess.killed) {
            childProcess.kill("SIGKILL");
          }
        }, 5000);
      }
    }, timeout);

    // Buffer for incomplete lines
    let stdoutBuffer = "";

    // Determine if we're in streaming mode (with --stream-partial-output flag)
    const isStreaming = options.streamPartialOutput ?? false;

    // Create promises for stdout, stderr, and exit
    const stdoutPromise = (async function* () {
      let firstStdout = false;
      for await (const chunk of childProcess!.stdout!) {
        if (!firstStdout) {
          firstStdout = true;
          options.onFirstStdout?.();
        }
        const data = chunk.toString();
        debugDump?.write(`[stdout] ${data}`);
        stdoutBuffer += data;

        // Process complete lines
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          const event = parseCursorStreamJsonLine(line, isStreaming);
          if (!event) {
            continue;
          }
          yield event;
        }
      }

      // Process any remaining buffered content
      if (stdoutBuffer.trim()) {
        const event = parseCursorStreamJsonLine(stdoutBuffer, isStreaming);
        if (event) {
          yield event;
        }
      }
    })();

    // Collect stderr for error reporting
    const stderrChunks: string[] = [];
    childProcess.stderr.on("data", (chunk) => {
      const data = chunk.toString();
      debugDump?.write(`[stderr] ${data}`);
      stderrChunks.push(data);
    });

    // Yield events from stdout
    for await (const event of stdoutPromise) {
      yield event;
    }

    // Wait for process to exit
    const exitCode = await new Promise<number | null>((resolve) => {
      childProcess!.on("close", (code) => resolve(code));
      childProcess!.on("error", (err) => {
        logger.error({ err, requestId }, "Process error");
        resolve(null);
      });
    });

    // Clear timeout
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }

    // Check for timeout
    if (killed) {
      throw new TimeoutError(`Agent CLI timed out after ${timeout}ms`);
    }

    // Check exit code
    if (exitCode !== 0 && exitCode !== null) {
      const stderrOutput = stderrChunks.join("");
      logger.error({ exitCode, stderr: stderrOutput, requestId }, "CLI exited with error");

      yield {
        type: "error",
        message: stderrOutput || `Agent CLI exited with code ${exitCode}`,
        code: `EXIT_${exitCode}`,
      } as CursorErrorEvent;
    }

    // Always yield done event
    yield { type: "done" } as CursorDoneEvent;
  } catch (err) {
    // Clear timeout on error
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    // Kill process on error
    if (childProcess && !childProcess.killed) {
      childProcess.kill("SIGTERM");
    }

    if (err instanceof TimeoutError) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId }, "Error running agent CLI");
    throw new CursorCLIError(`Failed to run agent CLI: ${message}`);
  } finally {
    // Close debug dump
    debugDump?.end();
  }
}

/**
 * Run the CLI and collect all output (non-streaming)
 */
export async function runCursorCLICollected(
  options: CursorCLIOptions,
  requestId: string = "unknown"
): Promise<{ content: string; events: CursorEvent[] }> {
  const events: CursorEvent[] = [];
  const textParts: string[] = [];

  for await (const event of runCursorCLI(options, requestId)) {
    events.push(event);
    if (event.type === "text") {
      textParts.push(event.content);
    }
  }

  return {
    content: textParts.join(""),
    events,
  };
}
