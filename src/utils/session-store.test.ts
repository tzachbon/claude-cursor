import { describe, expect, it } from "vitest";
import { deriveConversationKey } from "./session-store.ts";
import type { AnthropicMessageRequest } from "../types/anthropic.ts";

describe("deriveConversationKey", () => {
  it("stays stable as the conversation grows", () => {
    const base: AnthropicMessageRequest = {
      model: "auto",
      max_tokens: 64,
      stream: false,
      system: "You are helpful",
      messages: [{ role: "user", content: "hello" }],
    };

    const turnOne = deriveConversationKey(base);
    const turnTwo = deriveConversationKey({
      ...base,
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "again" },
      ],
    });

    expect(turnOne).toBe(turnTwo);
  });
});
