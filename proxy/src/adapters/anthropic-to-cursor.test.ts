import { describe, expect, it } from "vitest";
import { anthropicToCursor } from "./anthropic-to-cursor.ts";
import {
  AnthropicMessageRequestSchema,
  type AnthropicMessageRequest,
} from "../types/anthropic.ts";

describe("anthropicToCursor", () => {
  it("serializes tool_use and tool_result history into explicit markers", () => {
    const request: AnthropicMessageRequest = {
      model: "auto",
      max_tokens: 128,
      stream: false,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "Read",
              input: { path: "/tmp/example.txt" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: "sentinel-value",
            },
          ],
        },
        {
          role: "user",
          content: "Reply with the tool result only",
        },
      ],
    };

    const options = anthropicToCursor(request);
    expect(options.prompt).toContain("[Claude tool_use id=toolu_1 name=Read");
    expect(options.prompt).toContain("[Claude tool_result tool_use_id=toolu_1]");
    expect(options.prompt).toContain("sentinel-value");
  });

  it("sends only the latest turn when resuming a Cursor chat", () => {
    const request: AnthropicMessageRequest = {
      model: "auto",
      max_tokens: 64,
      stream: false,
      messages: [
        { role: "user", content: "first turn" },
        { role: "assistant", content: "first reply" },
        { role: "user", content: "second turn" },
      ],
    };

    const options = anthropicToCursor(request, {
      resumeChatId: "chat-123",
    });

    expect(options.resumeChatId).toBe("chat-123");
    expect(options.prompt).toContain("second turn");
    expect(options.prompt).not.toContain("first turn");
    expect(options.prompt).not.toContain("first reply");
  });

  it("retains tool history markers when resuming a Cursor chat", () => {
    const request: AnthropicMessageRequest = {
      model: "auto",
      max_tokens: 128,
      stream: false,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "Read",
              input: { path: "/tmp/example.txt" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: "sentinel-value",
            },
          ],
        },
        {
          role: "user",
          content: "Reply with the tool result only",
        },
      ],
    };

    const options = anthropicToCursor(request, {
      resumeChatId: "chat-123",
    });

    expect(options.prompt).toContain("Prior Claude tool history:");
    expect(options.prompt).toContain("sentinel-value");
    expect(options.prompt).toContain("Reply with the tool result only");
  });

  it("accepts and serializes Claude Code tool_reference results", () => {
    const request = AnthropicMessageRequestSchema.parse({
      model: "auto",
      max_tokens: 128,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_search",
              name: "ToolSearch",
              input: { query: "mempalace_search" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_search",
              content: [
                {
                  type: "tool_reference",
                  tool_name: "mcp__mempalace__mempalace_search",
                },
              ],
            },
          ],
        },
      ],
    });

    const options = anthropicToCursor(request);

    expect(options.prompt).toContain(
      "[Claude tool_reference tool_name=mcp__mempalace__mempalace_search]"
    );
  });
});
