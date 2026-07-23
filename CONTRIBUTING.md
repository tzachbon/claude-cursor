# Contributing to claude-cursor

Thanks for helping improve the bridge.

## Before you start

- Use an issue for bugs, compatibility gaps, or proposed behavior changes.
- Use GitHub's private vulnerability reporting for security problems.
- Keep changes focused on the documented Cursor Agent CLI. Do not add private
  Cursor endpoints, desktop-token extraction, or reverse-engineered protocols.

## Development setup

```sh
git clone https://github.com/tzachbon/claude-cursor.git
cd claude-cursor
nvm use
npm ci
npm run check
```

The tests do not call a live model. A real Cursor Agent installation is needed
only for manual end-to-end testing.

## Making a change

1. Create a focused branch from `main`.
2. Add or update tests for behavior changes.
3. Keep API compatibility claims in `docs/compatibility.md` accurate.
4. Run `npm run check`.
5. Run `npm audit` when dependencies change.
6. Open a pull request using the repository template.

## Coding conventions

- Use strict TypeScript and explicit types at protocol boundaries.
- Prefer Node.js standard-library APIs before adding dependencies.
- Keep request validation in routes, translation in adapters, and process
  handling in the upstream layer.
- Do not log prompts, message bodies, credentials, or raw authorization
  headers.
- Keep the server loopback-only by default.
- Treat the dedicated bridge workspace as context isolation, not a sandbox.

## Commit and pull request guidance

- Use a short imperative commit subject.
- Explain the user-visible impact and security implications.
- Include exact validation commands and results.
- Keep generated files, runtime databases, logs, and local settings out of Git.

By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
