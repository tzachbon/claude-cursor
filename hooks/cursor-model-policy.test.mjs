#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const hookPath = new URL("./cursor-model-policy.mjs", import.meta.url);
const result = spawnSync(process.execPath, [hookPath.pathname], {
  encoding: "utf8",
  input: JSON.stringify({ hook_event_name: "SessionStart" }),
});

assert.equal(result.status, 0, result.stderr);

const response = JSON.parse(result.stdout);
const context = response.hookSpecificOutput.additionalContext;

assert.match(
  context,
  /Available Cursor models \(\d+ synced\)|Use `\/model` to see or select/
);
assert.match(context, /Use `\/model`/);
assert.match(context, /omit the `model` parameter/);

console.log("cursor model policy advertises the synced Cursor catalog");
