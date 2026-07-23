#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const raw = await new Promise((resolve) => {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });
  process.stdin.on("end", () => resolve(input));
});

let event = {};
try {
  event = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

const hookEvent = event.hook_event_name ?? event.hookEventName;

if (hookEvent === "SessionStart") {
  let models = [];
  try {
    const settings = JSON.parse(
      await readFile(new URL("../settings.json", import.meta.url), "utf8")
    );
    models = Array.isArray(settings.availableModels)
      ? settings.availableModels
      : [];
  } catch {}

  const shownModels = models.slice(0, 12);
  const remainingModels = Math.max(0, models.length - shownModels.length);
  const catalog =
    models.length > 0
      ? `Available Cursor models (${models.length} synced): ${shownModels.join(", ")}${
          remainingModels > 0 ? `, and ${remainingModels} more` : ""
        }. Use \`/model\` to see or select the full catalog.\n\n`
      : "Use `/model` to see or select the Cursor models synced to this profile.\n\n";

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          "## Claude-cursor model policy\n\n" +
          catalog +
          "This profile uses Cursor models, not Anthropic billing. For Agent or Task calls, omit the `model` parameter so the sub-agent keeps the parent Cursor model. A parent on `auto` lets Cursor route every sub-agent. Do not use the bare Anthropic aliases `haiku`, `sonnet`, or `opus`; Claude Code's Agent schema does not expose this profile's custom Cursor model IDs. If a task needs a fixed Cursor model, use `/model` to select it for the parent session, then let sub-agents inherit it.",
      },
    })
  );
  process.exit(0);
}

process.exit(0);
