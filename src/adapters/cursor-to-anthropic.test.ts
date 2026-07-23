import { describe, expect, it } from "vitest";
import {
  cursorEventsToAnthropicResponse,
  cursorEventsToAnthropicSSE,
} from "./cursor-to-anthropic.ts";
import type { CursorEvent } from "../types/cursor.ts";

async function collectSse(events: AsyncIterable<CursorEvent>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of cursorEventsToAnthropicSSE(events, "auto", "test")) {
    chunks.push(chunk);
  }
  return chunks;
}

async function* eventStream(events: CursorEvent[]): AsyncGenerator<CursorEvent> {
  for (const event of events) {
    yield event;
  }
}

describe("cursorEventsToAnthropicSSE", () => {
  it("emits Claude tool_use blocks and a tool_use stop reason", async () => {
    const chunks = await collectSse(
      eventStream([
        { type: "text", content: "hello" },
        {
          type: "tool_call",
          id: "tool-1",
          name: "Agent",
          arguments: { prompt: "inspect repo" },
        },
        { type: "done" },
      ])
    );

    const payload = chunks.join("");
    expect(payload).toContain('"type":"content_block_delta"');
    expect(payload).toContain("hello");
    expect(payload).toContain('"type":"tool_use"');
    expect(payload).toContain('"name":"Agent"');
    expect(payload).toContain('"partial_json":"{\\"prompt\\":\\"inspect repo\\"}"');
    expect(payload).toContain('"stop_reason":"tool_use"');
  });

  it("emits structured error events instead of embedding runtime failures in text", async () => {
    const chunks = await collectSse(
      eventStream([
        { type: "error", message: "upstream failed" },
        { type: "done" },
      ])
    );

    const payload = chunks.join("");
    expect(payload).toContain('"type":"error"');
    expect(payload).toContain("upstream failed");
    expect(payload).not.toContain("[Error:");
  });

  it("returns non-streaming tool_use content for Claude Code", async () => {
    const response = await cursorEventsToAnthropicResponse(
      eventStream([
        {
          type: "tool_call",
          id: "tool-1",
          name: "Agent",
          arguments: { prompt: "inspect repo" },
        },
        { type: "done" },
      ]),
      "auto",
      "test"
    );

    expect(response.content).toEqual([
      {
        type: "tool_use",
        id: "tool-1",
        name: "Agent",
        input: { prompt: "inspect repo" },
      },
    ]);
    expect(response.stop_reason).toBe("tool_use");
  });
});
