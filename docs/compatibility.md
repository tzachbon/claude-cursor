# API compatibility

The bridge implements the API surface required for local Claude Code and basic
OpenAI-compatible chat clients. It is not a complete replacement for either
vendor's API.

## Anthropic Messages

Endpoint: `POST /v1/messages`

Supported:

- string and text-block message content
- system prompts supplied as `system` or system-role messages
- streaming and non-streaming responses
- tool-use and tool-result history serialization
- Claude tool-reference content
- conversation resumption
- structured Anthropic error responses

Current limitations:

- token usage is not available from the Cursor CLI
- upstream tool prevention is not guaranteed
- image and document blocks are not forwarded
- API authentication headers are accepted but not validated

## OpenAI Chat Completions

Endpoint: `POST /v1/chat/completions`

Supported:

- system, developer, user, assistant, and tool-role text
- streaming and non-streaming responses
- text content arrays
- model pass-through and common model aliases

Current limitations:

- image inputs are ignored
- function definitions and structured tool calls are not forwarded
- token usage is unavailable
- some finish reasons are approximated from CLI events

## Model discovery

`GET /v1/models` calls `agent --list-models` and returns the discovered IDs in
OpenAI list format. If discovery fails, the endpoint returns `auto`.

## Compatibility policy

Compatibility is tested against the request shapes represented in this
repository. Cursor Agent and client CLIs can change independently; include
client and Agent versions when filing a compatibility bug.
