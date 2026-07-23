import { describe, expect, it } from "vitest";
import { parseCursorStreamJsonLine } from "./cursor-cli.ts";

describe("parseCursorStreamJsonLine session capture", () => {
  it("extracts session_id from system events", () => {
    const line = JSON.stringify({
      type: "system",
      session_id: "abc-123",
    });

    expect(parseCursorStreamJsonLine(line, true)).toEqual({
      type: "session",
      chatId: "abc-123",
    });
  });
});
