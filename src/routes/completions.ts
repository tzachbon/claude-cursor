/**
 * POST /v1/chat/completions route handler
 * Implements OpenAI-compatible chat completions API
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { appConfig } from "../utils/config.ts";
import {
  ChatCompletionRequestSchema,
  type ChatCompletionRequest,
} from "../types/openai.ts";
import { openaiToCursor } from "../adapters/openai-to-cursor.ts";
import {
  cursorEventsToSSE,
  cursorEventsToResponse,
} from "../adapters/cursor-to-openai.ts";
import { runCursor } from "../upstream/index.ts";
import { createChildLogger } from "../utils/logger.ts";
import { ValidationError, toProxyError } from "../utils/errors.ts";

const logger = createChildLogger("completions");

/**
 * Fetch available models from agent CLI
 */
async function getAvailableModels(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(appConfig.cursorAgentPath, ["--list-models"], { timeout: 10000 }, (error, stdout) => {
      if (error) {
        logger.warn({ error }, "Failed to fetch models from agent CLI");
        resolve(["auto"]);
        return;
      }

      // Parse the output: "model-id - Model Name" format
      const models: string[] = [];
      const lines = stdout.split("\n");
      for (const line of lines) {
        const match = line.match(/^([a-z0-9.-]+)\s+-\s+/);
        if (match) {
          models.push(match[1]);
        }
      }

      resolve(models.length > 0 ? models : ["auto"]);
    });
  });
}

/**
 * Register the chat completions route
 */
export async function registerCompletionsRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    "/v1/chat/completions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = randomUUID();
      const startTime = Date.now();

      logger.info({ requestId }, "Received chat completion request");

      try {
        // Parse and validate request body
        const parseResult = ChatCompletionRequestSchema.safeParse(request.body);
        if (!parseResult.success) {
          const errors = parseResult.error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          }));
          logger.error({ requestId, errors }, "Validation failed");
          throw new ValidationError("Invalid request body", errors);
        }

        const body: ChatCompletionRequest = parseResult.data;
        const isStreaming = body.stream ?? false;

        logger.info(
          {
            requestId,
            model: body.model,
            messageCount: body.messages.length,
            streaming: isStreaming,
          },
          "Processing request"
        );

        // Convert to Cursor CLI options
        const cliOptions = openaiToCursor(body, {
          streaming: isStreaming,
        });

        if (isStreaming) {
          // Streaming response
          return await handleStreamingResponse(
            reply,
            cliOptions,
            body.model,
            requestId
          );
        } else {
          // Non-streaming response
          return await handleNonStreamingResponse(
            reply,
            cliOptions,
            body.model,
            requestId,
            startTime
          );
        }
      } catch (err) {
        const proxyError = toProxyError(err);
        logger.error(
          {
            requestId,
            error: proxyError.message,
            code: proxyError.code,
            statusCode: proxyError.statusCode,
          },
          "Request failed"
        );

        reply.status(proxyError.statusCode);
        return proxyError.toJSON();
      }
    }
  );

  // Also support the models endpoint for compatibility
  fastify.get("/v1/models", async () => {
    const models = await getAvailableModels();
    return {
      object: "list",
      data: models.map((id) => ({
        id,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "cursor",
      })),
    };
  });
}

/**
 * Handle streaming response
 */
async function handleStreamingResponse(
  reply: FastifyReply,
  cliOptions: ReturnType<typeof openaiToCursor>,
  model: string,
  requestId: string
): Promise<void> {
  // Set headers for SSE
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Request-Id": requestId,
  });

  try {
    // Run CLI and stream events
    const events = runCursor(cliOptions, requestId);
    const sseStream = cursorEventsToSSE(events, model);

    for await (const chunk of sseStream) {
      reply.raw.write(chunk);
    }
  } catch (err) {
    // If streaming has started, we can't change status code
    // Send error as a final SSE event
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    reply.raw.write(
      `data: {"error": {"message": "${errorMessage}", "type": "server_error"}}\n\n`
    );
    reply.raw.write("data: [DONE]\n\n");
    logger.error({ requestId, error: errorMessage }, "Streaming error");
  } finally {
    reply.raw.end();
  }
}

/**
 * Handle non-streaming response
 */
async function handleNonStreamingResponse(
  reply: FastifyReply,
  cliOptions: ReturnType<typeof openaiToCursor>,
  model: string,
  requestId: string,
  startTime: number
): Promise<unknown> {
  // Run CLI and collect all events
  const events = runCursor(cliOptions, requestId);
  const response = await cursorEventsToResponse(events, model);

  const duration = Date.now() - startTime;
  logger.info(
    {
      requestId,
      duration,
      contentLength: response.choices[0]?.message?.content?.length ?? 0,
    },
    "Request completed"
  );

  reply.header("X-Request-Id", requestId);
  return response;
}
