# @jemidev/mcp

MCP server for Jemi. It lets an AI assistant - Claude Code, Codex, Cursor, and anything else that speaks the Model Context Protocol - read and edit your Jemi projects.

It forwards every request to a Jemi tab over a local WebSocket bridge on `127.0.0.1:4401`.

```
assistant  ──stdio──▶  @jemidev/mcp  ──WebSocket──▶  your Jemi tab  ──▶  Jemi API
                    no keys, no storage               holds the keys
```

## Usage

Register it with your assistant and let the assistant start it:

```sh
claude mcp add jemi -- bunx @jemidev/mcp    # or: npx -y @jemidev/mcp
```

Then open Jemi, go to **Settings → MCP** and press **Connect**. That page has ready-made
snippets for Claude Code, Claude Desktop, Codex, OpenCode, Cursor, Gemini CLI, VS Code and
Windsurf.

Several assistants can be registered at once. The browser can only reach one port, so the first
process to start holds the bridge and the rest forward their calls to it — one tab serves all
of them.

### HTTP instead

The server also speaks Streamable HTTP on `http://127.0.0.1:4401/mcp`, for clients that cannot
spawn a process. Then you start it yourself and leave it running:

```sh
bunx @jemidev/mcp
claude mcp add --transport http jemi http://127.0.0.1:4401/mcp
```

Which transport you get depends on whether stdin is a TTY: an MCP client spawns the process with
a pipe and gets stdio, a human typing the command in a terminal gets the HTTP server. Pass
`--stdio` or `--http` to say so explicitly.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `JEMI_MCP_PORT` | `4401` | Port the browser bridge lives on. Change it in your client config too. |
| `JEMI_MCP_TRANSPORT` | — | `stdio` or `http`, overriding the TTY check. Same as the flags. |
| `JEMI_MCP_ALLOWED_ORIGINS` | `https://app.jemi.dev` | Comma-separated origins allowed to attach a bridge. |

The origin allowlist matters: without it any page you visit could connect to the local port and
feed your assistant fabricated project data. It could not read anything — it has no keys — but it
could lie.

## Tools

34 tools covering projects, channels, tasks, documents, comments, chat, dictionaries (tags,
priorities, difficulties) and members. Ids are opaque, so resolve them first —
`jemi_list_projects` → `jemi_list_channels` — before acting. The exception is a task number
like `ALP-0254`: `jemi_find_task_by_key` resolves it in one call.

`jemi_list_tasks` filters by board, title, tag, priority, difficulty, assignee and by what a
task is *missing*, and returns a brief shape by default — listing a busy channel in full does
not fit in an assistant's context. Bulk tools (`jemi_update_tasks`,
`jemi_update_dictionary_items`, `jemi_create_tasks`, `jemi_delete_tasks`) exist so twenty edits
are one call.

Task bodies, comments and chat messages are markdown — CommonMark and GFM, plus a Jemi spelling
for what markdown lacks (underline, colour, mentions, attachments). `jemi_document_format`
returns the syntax each surface accepts.

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
