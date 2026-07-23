/**
 * POST /v1/messages route handler
 * Implements Anthropic Messages API
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import {
  AnthropicMessageRequestSchema,
  type AnthropicMessageRequest,
  type AnthropicErrorResponse,
} from "../types/anthropic.ts";
import { anthropicToCursor } from "../adapters/anthropic-to-cursor.ts";
import {
  cursorEventsToAnthropicSSE,
  cursorEventsToAnthropicResponse,
} from "../adapters/cursor-to-anthropic.ts";
import { runCursor, getUpstreamState } from "../upstream/index.ts";
import { createChildLogger } from "../utils/logger.ts";
import { toProxyError } from "../utils/errors.ts";
import { normalizeAnthropicRequestBody } from "../utils/normalize-anthropic-request.ts";
import {
  startRequestMetrics,
  markSpawnStarted,
  markSpawnReady,
  markFirstStdout,
  markFirstDelta,
  markCompleted,
  metricsHeaders,
  type RequestMetrics,
} from "../utils/request-metrics.ts";
import {
  deriveConversationKey,
  ensureChatId,
  setChatId,
} from "../utils/session-store.ts";

const logger = createChildLogger("messages");

function createErrorResponse(
  type: AnthropicErrorResponse["error"]["type"],
  message: string
): AnthropicErrorResponse {
  return {
    type: "error",
    error: {
      type,
      message,
    },
  };
}

function getUpstreamMode(): RequestMetrics["upstreamMode"] {
  return getUpstreamState().activeMode;
}

function attachCliTiming<T extends ReturnType<typeof anthropicToCursor>>(
  cliOptions: T,
  metrics: RequestMetrics
): T {
  cliOptions.onSpawnStarted = () => markSpawnStarted(metrics);
  cliOptions.onSpawnReady = () => markSpawnReady(metrics);
  cliOptions.onFirstStdout = () => markFirstStdout(metrics);
  return cliOptions;
}

export async function registerMessagesRoute(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get("/v1/metrics", async () => {
    const { getRecentMetrics, summarizeMetrics } = await import(
      "../utils/request-metrics.ts"
    );
    const recent = getRecentMetrics();
    return {
      summary: summarizeMetrics(recent),
      upstream: getUpstreamState(),
      recent: recent.map((item) => ({
        requestId: item.requestId,
        upstreamMode: item.upstreamMode,
        streaming: item.streaming,
        firstDeltaMs:
          item.firstDeltaAtMs === null
            ? null
            : item.firstDeltaAtMs - item.receivedAtMs,
        spawnReadyMs:
          item.spawnStartedAtMs === null || item.spawnReadyAtMs === null
            ? null
            : item.spawnReadyAtMs - item.spawnStartedAtMs,
        spawnToStdoutMs:
          item.spawnStartedAtMs === null || item.firstStdoutAtMs === null
            ? null
            : item.firstStdoutAtMs - item.spawnStartedAtMs,
        resumeChatId: item.resumeChatId,
        totalMs:
          item.completedAtMs === null
            ? null
            : item.completedAtMs - item.receivedAtMs,
      })),
    };
  });

  fastify.post(
    "/v1/messages",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = randomUUID();
      const startTime = Date.now();

      logger.info({ requestId }, "Received Anthropic messages request");

      try {
        const normalizedBody = normalizeAnthropicRequestBody(request.body);
        const parseResult = AnthropicMessageRequestSchema.safeParse(normalizedBody);
        if (!parseResult.success) {
          const errors = parseResult.error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          }));
          logger.error(
            {
              requestId,
              errors,
            },
            "Validation failed"
          );

          reply.status(400);
          return createErrorResponse(
            "invalid_request_error",
            `Invalid request: ${errors.map((e) => `${e.path}: ${e.message}`).join(", ")}`
          );
        }

        const body: AnthropicMessageRequest = parseResult.data;
        const isStreaming = body.stream ?? false;
        const conversationKey = deriveConversationKey(body);
        const upstreamMode = getUpstreamMode();
        const resumeChatId = ensureChatId(conversationKey);
        const metrics = startRequestMetrics(
          requestId,
          upstreamMode,
          isStreaming,
          resumeChatId
        );

        logger.info(
          {
            requestId,
            model: body.model,
            messageCount: body.messages.length,
            maxTokens: body.max_tokens,
            streaming: isStreaming,
            hasSystem: !!body.system,
            conversationKey,
            resumeChatId: resumeChatId ?? undefined,
          },
          "Processing request"
        );

        const cliOptions = attachCliTiming(
          anthropicToCursor(body, {
            streaming: isStreaming,
            resumeChatId,
          }),
          metrics
        );

        if (isStreaming) {
          return await handleStreamingResponse(
            reply,
            cliOptions,
            body.model,
            requestId,
            metrics,
            conversationKey
          );
        }

        return await handleNonStreamingResponse(
          reply,
          cliOptions,
          body.model,
          requestId,
          startTime,
          metrics,
          conversationKey
        );
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

        let errorType: AnthropicErrorResponse["error"]["type"] = "api_error";
        if (proxyError.statusCode === 400) {
          errorType = "invalid_request_error";
        } else if (proxyError.statusCode === 401) {
          errorType = "authentication_error";
        } else if (proxyError.statusCode === 403) {
          errorType = "permission_error";
        } else if (proxyError.statusCode === 404) {
          errorType = "not_found_error";
        } else if (proxyError.statusCode === 429) {
          errorType = "rate_limit_error";
        } else if (proxyError.statusCode === 529) {
          errorType = "overloaded_error";
        }

        return createErrorResponse(errorType, proxyError.message);
      }
    }
  );
}

async function* captureSessionId(
  events: AsyncIterable<import("../types/cursor.ts").CursorEvent>,
  conversationKey: string
): AsyncGenerator<import("../types/cursor.ts").CursorEvent, void, unknown> {
  for await (const event of events) {
    if (event.type === "session" && event.chatId) {
      setChatId(conversationKey, event.chatId);
    }
    yield event;
  }
}

async function handleStreamingResponse(
  reply: FastifyReply,
  cliOptions: ReturnType<typeof anthropicToCursor>,
  model: string,
  requestId: string,
  metrics: RequestMetrics,
  conversationKey: string
): Promise<void> {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Request-Id": requestId,
    ...metricsHeaders(metrics),
  });

  try {
    const rawEvents = runCursor(cliOptions, requestId);
    const sseStream = cursorEventsToAnthropicSSE(
      captureSessionId(rawEvents, conversationKey),
      model,
      requestId
    );

    for await (const chunk of sseStream) {
      if (
        metrics.firstDeltaAtMs === null &&
        chunk.includes('"type":"content_block_delta"')
      ) {
        markFirstDelta(metrics);
      }

      reply.raw.write(chunk);
      const response = reply.raw as typeof reply.raw & {
        flush?: () => void;
      };
      if (typeof response.flush === "function") {
        response.flush();
      }
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    const errorEvent = {
      type: "error",
      error: {
        type: "api_error",
        message: errorMessage,
      },
    };
    reply.raw.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
    logger.error({ requestId, error: errorMessage }, "Streaming error");
  } finally {
    markCompleted(metrics);
    reply.raw.end();
  }
}

async function handleNonStreamingResponse(
  reply: FastifyReply,
  cliOptions: ReturnType<typeof anthropicToCursor>,
  model: string,
  requestId: string,
  startTime: number,
  metrics: RequestMetrics,
  conversationKey: string
): Promise<unknown> {
  const rawEvents = runCursor(cliOptions, requestId);
  const response = await cursorEventsToAnthropicResponse(
    captureSessionId(rawEvents, conversationKey),
    model,
    requestId
  );

  markCompleted(metrics);
  const duration = Date.now() - startTime;
  logger.info(
    {
      requestId,
      duration,
      contentLength:
        response.content[0]?.type === "text"
          ? response.content[0].text.length
          : 0,
    },
    "Request completed"
  );

  reply.header("X-Request-Id", requestId);
  for (const [key, value] of Object.entries(metricsHeaders(metrics))) {
    reply.header(key, value);
  }
  return response;
}
