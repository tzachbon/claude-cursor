# Claude Cursor bridge

Run Claude Code or an OpenAI-compatible client against models available through
the Cursor Agent CLI.

## Included

- `proxy/` provides Anthropic Messages and OpenAI Chat Completions endpoints
  backed by the local Cursor Agent CLI.
- `hooks/cursor-model-policy.mjs` adds model-selection guidance at session start.
- `hooks/cursor-model-policy.test.mjs` verifies the hook output.
- `settings.example.json` shows the minimum hook configuration.

See [`proxy/README.md`](proxy/README.md) for installation, configuration,
examples, architecture, and security boundaries.

## Intentionally excluded

Live settings, credentials, histories, sessions, databases, environment
snapshots, project metadata, plugin caches, and marketplace checkouts are
intentionally excluded.

The proxy uses Cursor's documented CLI. Experimental code for Cursor's private
transport, desktop-token extraction, and reverse-engineered wire formats is not
included.

## Hook use

Copy the hook into your Claude configuration directory and merge the example
`SessionStart` entry into your settings. Update the command path for your
machine.

Run the test with:

```sh
node hooks/cursor-model-policy.test.mjs
```
