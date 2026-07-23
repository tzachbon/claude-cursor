import { describe, expect, it } from "vitest";
import { parseCursorStreamJsonLine } from "./cursor-cli.ts";

function assistantLine(
  text: string,
  fields: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
    ...fields,
  });
}

describe("parseCursorStreamJsonLine", () => {
  it("preserves repeated streaming tokens while omitting snapshot and final copies", () => {
    const lines = [
      assistantLine("a", { timestamp_ms: 1 }),
      assistantLine("a", { timestamp_ms: 2 }),
      assistantLine("aa", { timestamp_ms: 3, model_call_id: "call-1" }),
      assistantLine("aa"),
    ];

    const events = lines
      .map((line) => parseCursorStreamJsonLine(line, true))
      .filter((event) => event?.type === "text");

    expect(events).toEqual([
      { type: "text", content: "a" },
      { type: "text", content: "a" },
    ]);
  });

  it("keeps only the final assistant message for a non-streaming request", () => {
    const partial = parseCursorStreamJsonLine(
      assistantLine("partial", { timestamp_ms: 1 }),
      false
    );
    const final = parseCursorStreamJsonLine(assistantLine("complete"), false);

    expect(partial).toBeNull();
    expect(final).toEqual({ type: "text", content: "complete" });
  });
});
