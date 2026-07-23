/**
 * Custom error types for the proxy
 */

export class ProxyError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "PROXY_ERROR",
    details?: unknown
  ) {
    super(message);
    this.name = "ProxyError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        type: this.code,
        code: this.statusCode,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export class ValidationError extends ProxyError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class CursorCLIError extends ProxyError {
  constructor(message: string, details?: unknown) {
    super(message, 502, "CURSOR_CLI_ERROR", details);
    this.name = "CursorCLIError";
  }
}

export class TimeoutError extends ProxyError {
  constructor(message: string = "Request timed out") {
    super(message, 504, "TIMEOUT_ERROR");
    this.name = "TimeoutError";
  }
}

export class ConfigurationError extends ProxyError {
  constructor(message: string) {
    super(message, 500, "CONFIGURATION_ERROR");
    this.name = "ConfigurationError";
  }
}

// Helper to convert unknown errors to ProxyError
export function toProxyError(err: unknown): ProxyError {
  if (err instanceof ProxyError) {
    return err;
  }
  if (err instanceof Error) {
    return new ProxyError(err.message, 500, "INTERNAL_ERROR");
  }
  return new ProxyError(String(err), 500, "UNKNOWN_ERROR");
}
