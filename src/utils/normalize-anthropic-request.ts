/**
 * Normalize Anthropic request bodies before schema validation.
 * Claude Code may send system prompts as messages with role "system".
 */

type RawMessage = {
  role?: string;
  content?: unknown;
};

type RawRequest = Record<string, unknown> & {
  messages?: RawMessage[];
  system?: unknown;
};

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      (block as { type?: string }).type === "text" &&
      "text" in block
    ) {
      parts.push(String((block as { text: unknown }).text));
    }
  }
  return parts.join("\n");
}

function mergeSystem(existing: unknown, addition: string): unknown {
  if (!addition) {
    return existing;
  }
  if (!existing) {
    return addition;
  }
  if (typeof existing === "string") {
    return `${existing}\n\n${addition}`;
  }
  if (Array.isArray(existing)) {
    return [...existing, { type: "text", text: addition }];
  }
  return addition;
}

export function normalizeAnthropicRequestBody(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    return body;
  }

  const request = body as RawRequest;
  const messages = Array.isArray(request.messages) ? request.messages : [];
  if (messages.length === 0) {
    return body;
  }

  let system = request.system;
  const normalizedMessages: RawMessage[] = [];

  for (const message of messages) {
    if (message?.role === "system") {
      system = mergeSystem(system, extractText(message.content));
      continue;
    }
    normalizedMessages.push(message);
  }

  if (normalizedMessages.length === messages.length) {
    return body;
  }

  return {
    ...request,
    system,
    messages: normalizedMessages.length > 0 ? normalizedMessages : messages,
  };
}
