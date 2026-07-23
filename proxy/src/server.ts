/**
 * Fastify server setup
 */

import Fastify, { type FastifyInstance } from "fastify";
import { createChildLogger, logger } from "./utils/logger.ts";
import { appConfig } from "./utils/config.ts";
import { registerCompletionsRoute } from "./routes/completions.ts";
import { registerMessagesRoute } from "./routes/messages.ts";
import { toProxyError } from "./utils/errors.ts";
import { cleanup as cleanupUpstream, getUpstreamState } from "./upstream/index.ts";
import { startCliWarmup } from "./utils/cli-warmup.ts";

const serverLogger = createChildLogger("server");

/**
 * Create and configure the Fastify server
 */
export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false, // We use our own pino logger
    requestTimeout: appConfig.cursorTimeoutMs + 30000, // Give extra time beyond CLI timeout
    bodyLimit: 10 * 1024 * 1024, // 10MB body limit
  });

  // Health check endpoint
  fastify.get("/health", async () => {
    const upstream = getUpstreamState();
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      upstream: upstream.activeMode,
      configuredUpstream: upstream.configuredMode,
    };
  });

  // Root endpoint
  fastify.get("/", async () => {
    return {
      name: "cursor-proxy",
      version: "1.0.0",
      description: "OpenAI and Anthropic compatible API proxy for Cursor",
      mode: getUpstreamState().activeMode,
      endpoints: {
        health: "/health",
        openai: {
          completions: "/v1/chat/completions",
          models: "/v1/models",
        },
        anthropic: {
          messages: "/v1/messages",
        },
      },
    };
  });

  // Register routes
  await registerCompletionsRoute(fastify);
  await registerMessagesRoute(fastify);

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    const proxyError = toProxyError(error);
    serverLogger.error(
      {
        error: proxyError.message,
        code: proxyError.code,
        statusCode: proxyError.statusCode,
        url: request.url,
        method: request.method,
      },
      "Unhandled error"
    );

    reply.status(proxyError.statusCode).send(proxyError.toJSON());
  });

  // Request logging hook
  fastify.addHook("onRequest", (request, _reply, done) => {
    serverLogger.debug(
      {
        method: request.method,
        url: request.url,
        contentType: request.headers["content-type"],
      },
      "Incoming request"
    );
    done();
  });

  // Response logging hook
  fastify.addHook("onResponse", (request, reply, done) => {
    serverLogger.debug(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      "Request completed"
    );
    done();
  });

  return fastify;
}

/**
 * Start the server
 */
export async function startServer(fastify: FastifyInstance): Promise<void> {
  try {
    const address = await fastify.listen({
      port: appConfig.port,
      host: appConfig.host,
    });

    logger.info(
      {
        address,
        port: appConfig.port,
        host: appConfig.host,
      },
      "Server started"
    );

    logger.info("OpenAI-compatible endpoints:");
    logger.info(`  POST ${address}/v1/chat/completions`);
    logger.info(`  GET  ${address}/v1/models`);
    logger.info("Anthropic-compatible endpoints:");
    logger.info(`  POST ${address}/v1/messages`);
    logger.info("Health:");
    logger.info(`  GET  ${address}/health`);
    startCliWarmup();
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    throw err;
  }
}

/**
 * Graceful shutdown
 */
export async function stopServer(fastify: FastifyInstance): Promise<void> {
  logger.info("Shutting down server...");
  await fastify.close();
  await cleanupUpstream();
  logger.info("Server stopped");
}
