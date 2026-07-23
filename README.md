# Claude Cursor configuration excerpts

Public, reusable pieces of a local Claude Code profile that uses Cursor models.

## Included

- `hooks/cursor-model-policy.mjs` adds model-selection guidance at session start.
- `hooks/cursor-model-policy.test.mjs` verifies the hook output.
- `settings.example.json` shows the minimum hook configuration.

## Not included

Live settings, credentials, histories, sessions, databases, environment
snapshots, project metadata, plugin caches, and marketplace checkouts are
intentionally excluded.

## Use

Copy the hook into your Claude configuration directory and merge the example
`SessionStart` entry into your settings. Update the command path for your
machine.

Run the test with:

```sh
node hooks/cursor-model-policy.test.mjs
```
