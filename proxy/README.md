# Cursor CLI API bridge

A local TypeScript service that translates Anthropic Messages and OpenAI Chat
Completions requests into non-interactive Cursor Agent CLI calls.

The bridge supports streaming responses, model discovery, conversation
resumption, request timing, and both Anthropic- and OpenAI-shaped clients. It
uses the documented Cursor CLI rather than Cursor's private transport.

## Requirements

- Node.js 22 or newer
- Cursor Agent CLI installed and authenticated
- A Cursor plan or API key that permits CLI model use

Install Cursor Agent using the
[official installation guide](https://docs.cursor.com/en/cli/installation),
then confirm the executable is available:

```sh
agent --version
agent status
```

`agent` is the current command name. If your installation only exposes the
older `cursor-agent` alias, set `CURSOR_AGENT_PATH=cursor-agent`.

## Start

```sh
cd proxy
npm ci
cp .env.example .env
npm start
```

The server listens only on `127.0.0.1:8080` by default.

```sh
curl http://127.0.0.1:8080/health
```

## Connect Claude Code

Claude Code supports a custom Anthropic API base URL. The bridge does not
validate the downstream token, but Claude Code expects a non-empty value:

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:8080 \
ANTHROPIC_AUTH_TOKEN=local-cursor-bridge \
claude
```

The service implements `POST /v1/messages`, including server-sent-event
streaming. It maps Claude conversation metadata to Cursor chat IDs in a local
SQLite database so later turns can use `agent --resume`.

## Use the OpenAI-compatible endpoint

```sh
curl http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model": "auto",
    "stream": false,
    "messages": [
      {"role": "user", "content": "Reply with exactly: bridge-ok"}
    ]
  }'
```

Available endpoints:

- `GET /`
- `GET /health`
- `GET /v1/models`
- `GET /v1/metrics`
- `POST /v1/messages`
- `POST /v1/chat/completions`

## Configuration

Copy `.env.example` to `.env`. The main options are:

- `CURSOR_AGENT_PATH`: Cursor CLI executable; defaults to `agent`
- `CURSOR_DEFAULT_MODEL`: fallback model; defaults to `auto`
- `CURSOR_TIMEOUT_MS`: upstream timeout in milliseconds
- `CURSOR_BRIDGE_WORKSPACE`: isolated workspace used by Cursor Agent
- `CURSOR_SESSION_STORE_PATH`: SQLite conversation-map location
- `CURSOR_CLI_WARMUP`: optionally run one background warmup request at startup
- `CURSOR_PROACTIVE_CHAT`: create a Cursor chat before the first turn
- `DEBUG_DUMP_OUTPUT`: write raw CLI output under `debug/`

## Data flow

1. A client sends an Anthropic or OpenAI request to the local Fastify server.
2. The request adapter validates it and builds a Cursor Agent prompt.
3. The upstream runner launches `agent` with structured streaming output.
4. The response adapter converts Cursor events into the client's API format.
5. Anthropic conversations persist only a derived conversation key and Cursor
   chat ID, allowing later turns to resume.

## Security boundaries

- Keep the default loopback host. The service has no downstream authentication
  or TLS and must not be exposed directly to a network.
- Cursor Agent is launched non-interactively with `--force` and `--trust`.
  Requests run in a dedicated bridge workspace, but this is not a sandbox or a
  proven no-tools boundary.
- Prompts are sent to Cursor under the terms and data controls of your Cursor
  account.
- Normal request logs contain metadata and timings, not prompt bodies.
- `DEBUG_DUMP_OUTPUT=true` may store model output locally. Debug files, `.env`,
  session databases, and dependencies are ignored by Git.
- This project does not extract desktop tokens, call private Cursor endpoints,
  or implement reverse-engineered protocols.

## Validate

```sh
npm run typecheck
npm test
```
