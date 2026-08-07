# @jemidev/mcp

MCP server for Jemi. It lets an AI assistant - Claude Code, Codex, Cursor, and anything else that speaks the Model Context Protocol - read and edit your Jemi projects.

It listens on `127.0.0.1:4401`, and forwards every request to a Jemi tab over a local WebSocket bridge.

```
assistant  ──HTTP──▶  jemi-mcp (127.0.0.1:4401)  ──WebSocket──▶  your Jemi tab  ──▶  Jemi API
                       no keys, no storage                        holds the keys
```

## Usage

Start the server and leave it running:

```sh
bunx @jemidev/mcp    # or: npx -y @jemidev/mcp
```

Register it with your assistant:

```sh
claude mcp add --transport http jemi http://127.0.0.1:4401/mcp
```

Then open Jemi, go to **Settings → MCP** and press **Connect**. That page also has ready-made
snippets for Claude Desktop, Codex, OpenCode, Cursor, Gemini CLI, VS Code and Windsurf.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `JEMI_MCP_PORT` | `4401` | Port to listen on. Change it in your client config too. |
| `JEMI_MCP_ALLOWED_ORIGINS` | `https://app.jemi.dev` | Comma-separated origins allowed to attach a bridge. |

The origin allowlist matters: without it any page you visit could connect to the local port and
feed your assistant fabricated project data. It could not read anything — it has no keys — but it
could lie.

## Tools

30 tools covering projects, channels, tasks, documents, comments, chat, dictionaries (tags,
priorities, difficulties) and members. Ids are opaque, so resolve them first —
`jemi_list_projects` → `jemi_list_channels` — before acting.

Destructive tools (deleting a task, a channel, a dictionary entry) require a `confirmation`
argument that the assistant must get from you in words. That is a guardrail against an
over-eager agent, not a security boundary.

## Bridge protocol

The frame types the server and the browser exchange are published as a subpath export, for
anyone building another bridge:

```ts
import { MCP_PROTOCOL_VERSION, parseFrame, type TMcpBridgeFrame } from '@jemidev/mcp/protocol'
```

Only one bridge may be attached at a time: every operation targets "the tab the user is looking
at", and with two tabs connected there is no way to say which one that is.

## Development

```sh
bun install
bun run dev          # watch mode, from source
bun run build        # bundles dist/ for Node
bun run check-types
```

The runtime is plain Node (`node:http` + `ws`) so the package works under `npx` as well as
`bunx`; Bun is used for the toolchain.

## License

[MIT](./LICENSE) © Jemi
