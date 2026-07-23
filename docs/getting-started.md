# Getting started

This guide covers local installation, client configuration, and the runtime
files created by `claude-cursor`.

## 1. Install prerequisites

Use Node.js 22.18 or newer:

```sh
nvm use
node --version
```

Install Cursor Agent using the
[official installation guide](https://docs.cursor.com/en/cli/installation),
then verify authentication:

```sh
agent --version
agent status
```

`agent` is the current command name. If your installation exposes only the
older `cursor-agent` alias, set `CURSOR_AGENT_PATH=cursor-agent`.

## 2. Install dependencies

```sh
git clone https://github.com/tzachbon/claude-cursor.git
cd claude-cursor
npm ci
cp .env.example .env
```

## 3. Configure the bridge

The defaults are suitable for a local installation.

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP bind address; keep loopback-only |
| `PORT` | `8080` | HTTP port |
| `LOG_LEVEL` | `info` | Pino log level |
| `CURSOR_AGENT_PATH` | `agent` | Cursor Agent executable |
| `CURSOR_DEFAULT_MODEL` | `auto` | model used when the request has no concrete mapping |
| `CURSOR_TIMEOUT_MS` | `300000` | upstream request timeout |
| `CURSOR_BRIDGE_WORKSPACE` | `~/.claude-cursor/bridge-workspace` | isolated Agent workspace |
| `CURSOR_SESSION_STORE_PATH` | `~/.claude-cursor/cursor-proxy-sessions.db` | conversation mapping database |
| `CURSOR_CLI_WARMUP` | `false` | optionally issue a warmup request at startup |
| `CURSOR_PROACTIVE_CHAT` | `true` | create a chat ID before the first turn |
| `CURSOR_API_KEY` | unset | optional Cursor CLI API key |
| `DEBUG_DUMP_OUTPUT` | `false` | write raw CLI output under `debug/` |

## 4. Start the service

```sh
npm start
```

For development with automatic restart:

```sh
npm run dev
```

Confirm the service and upstream mode:

```sh
curl http://127.0.0.1:8080/health
```

## 5. Connect a client

### Claude Code

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:8080 \
ANTHROPIC_AUTH_TOKEN=local-cursor-bridge \
claude
```

### OpenAI-compatible request

```sh
curl http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "auto",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello from the bridge"}]
  }'
```

## Runtime data

The bridge stores only the data needed to resume conversations:

- a derived conversation key
- the corresponding Cursor chat ID
- an update timestamp

Prompts are not stored in the session database. Setting
`DEBUG_DUMP_OUTPUT=true` writes raw CLI output to disk and should be used only
for short-lived local diagnosis.

The repository ignores `.env`, `debug/`, dependencies, logs, and SQLite files.
