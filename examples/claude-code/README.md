# Claude Code model-policy hook

This optional example adds Cursor model-selection guidance to Claude Code's
session context.

## Install

Copy the hook into your Claude configuration directory:

```sh
mkdir -p "$HOME/.claude-cursor/hooks"
cp examples/claude-code/hooks/cursor-model-policy.mjs \
  "$HOME/.claude-cursor/hooks/cursor-model-policy.mjs"
```

Merge the `SessionStart` entry from `settings.example.json` into the relevant
Claude Code settings file and update its command path if necessary.

## Test

From the repository root:

```sh
npm run test:hook
```

The hook reads `availableModels` from the settings file beside the installed
`hooks/` directory. It emits guidance only at session start and does not modify
settings.
