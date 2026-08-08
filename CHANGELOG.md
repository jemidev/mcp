# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.3.0] - 2026-08-08

### Features

- **stdio transport**, so the assistant spawns the server itself and there is nothing to start by hand: `claude mcp add jemi -- bunx @jemidev/mcp`. The transport is chosen by whether stdin is a TTY — an MCP client gets stdio, a human running the command in a terminal gets the HTTP server as before. `--stdio` / `--http` and `JEMI_MCP_TRANSPORT` override the check.
- **Several assistants at once**. Only one process can hold the browser bridge port, so the first to start keeps it and the rest forward their operations to it over a new local `POST /relay` endpoint. One tab serves all of them.

### Docs

- README covers stdio registration, the multi-client behaviour and the new environment variable.

## [v0.2.0] - 2026-08-08

### Features

- **Documents are markdown**. Task bodies, comments and chat messages are read and written as CommonMark + GFM instead of TipTap JSON. Jemi's own syntax covers what markdown lacks: `++underline++`, `<red>text</red>` or `<#b53636>text</#b53636>`, `@memberId` / `#channelId` mentions, `jemi:image/ID` attachment references, and emoji written as the character itself. Assistants were producing markdown anyway and having it stored as flat text.

- **`jemi_find_task_by_key`** resolves a task number like `ALP-0254` in one call. Tasks now carry `key` and `identifier`.
- **`jemi_list_tasks` filters**: by board, title text, tag, priority, difficulty and assignee, plus `missing` for tasks that have no priority or no difficulty set. Results are paged (`total`, `limit`, `offset`) and default to a brief shape — listing a busy channel in full does not fit in an assistant's context.
- **Bulk tools** `jemi_update_tasks` and `jemi_update_dictionary_items`, so twenty edits are one call.
- **`jemi_document_format`** returns the syntax each surface accepts; comments and chat take a narrower set than task bodies (no horizontal rules, no colour).

### Bug Fixes

- Task body edits reach tabs that already have the task open. A tab owns the live Yjs document, so writing the stored field behind its back was silently overwritten on its next save; the change now also goes into the collaboration room as an ordinary update.
- Confirmation prompts on destructive tools name the task instead of only its id.

### Internal

- Publishing relies on npm OIDC provenance; the workflow no longer passes a token that conflicts with it.

## [v0.1.0] - 2026-08-07

Initial release. An MCP server that runs on your machine and forwards every operation to a Jemi
browser tab over a local WebSocket bridge — the tab holds the encryption keys, the server holds
nothing.

[v0.3.0]: https://github.com/jemidev/mcp/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/jemidev/mcp/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/jemidev/mcp/releases/tag/v0.1.0
