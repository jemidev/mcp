#!/usr/bin/env node
import {
	createServer as createHttpServer,
	type IncomingMessage,
	type Server as HttpServer,
	type ServerResponse
} from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { WebSocketServer } from 'ws'

import { MCP_DEFAULT_HTTP_PORT, type TMcpOperationName, type TMcpParams } from '../protocol'
import { BridgeHub, McpBridgeError, RemoteHub, type McpHub } from './bridge'
import { registerTools } from './tools'
import { VERSION } from './version'

const port = Number(process.env.JEMI_MCP_PORT ?? MCP_DEFAULT_HTTP_PORT)
const origin = `http://127.0.0.1:${port}`

// Origins allowed to attach a bridge. A hostile page can otherwise connect to the local port and
// impersonate the user's tab — it could not read anything (it has no keys) but it could feed the
// assistant fabricated project data.
const allowedOrigins = new Set(
	(process.env.JEMI_MCP_ALLOWED_ORIGINS ?? 'https://app.jemi.dev')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean)
)

/**
 * How the assistant talks to us. `stdio` is what an MCP client config gets by default — it
 * spawns us as a child process and speaks JSON-RPC over the pipe. A human running the command
 * in a terminal has a TTY on stdin and clearly meant to leave a server running, so they get
 * `http` instead of a process that silently waits for bytes that will never come.
 */
const transportMode =
	process.argv.includes('--stdio') || process.env.JEMI_MCP_TRANSPORT === 'stdio'
		? 'stdio'
		: process.argv.includes('--http') || process.env.JEMI_MCP_TRANSPORT === 'http'
			? 'http'
			: process.stdin.isTTY
				? 'http'
				: 'stdio'

const hub = new BridgeHub()

function createMcpServer(target: McpHub): McpServer {
	const server = new McpServer(
		{ name: 'jemi', version: VERSION },
		{
			instructions:
				"Jemi project management. Every call is executed inside the user's browser tab, so encrypted content is readable only while that tab is open. Results are JSON. Always resolve ids via jemi_list_projects → jemi_list_channels before acting, except when the user names a task by its number (ALP-0254) — then use jemi_find_task_by_key directly. Prefer the filters on jemi_list_tasks and the bulk tools over repeating a single-item call."
		}
	)
	registerTools(server, target)
	return server
}

function readBody(request: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let raw = ''
		request.on('data', (chunk) => (raw += chunk))
		request.on('error', reject)
		request.on('end', () => {
			if (!raw) return resolve(undefined)
			try {
				resolve(JSON.parse(raw))
			} catch (error) {
				reject(error)
			}
		})
	})
}

function json(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { 'content-type': 'application/json' })
	response.end(JSON.stringify(body))
}

/** Runs one operation on behalf of another @jemidev/mcp process. See `RemoteHub`. */
async function handleRelay(request: IncomingMessage, response: ServerResponse): Promise<void> {
	const body = (await readBody(request)) as
		| { op?: TMcpOperationName; params?: TMcpParams<TMcpOperationName> }
		| undefined

	if (!body?.op) {
		json(response, 400, { ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing op' } })
		return
	}

	try {
		const result = await hub.call(body.op, body.params as never)
		json(response, 200, { ok: true, result, user: hub.user })
	} catch (error) {
		const detail =
			error instanceof McpBridgeError
				? error.detail
				: { code: 'INTERNAL' as const, message: String(error) }
		json(response, 200, { ok: false, error: detail, user: hub.user })
	}
}

function createLocalServer(): HttpServer {
	const http = createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
		const path = (request.url ?? '/').split('?')[0]

		if (path === '/health') {
			json(response, 200, { bridge: hub.connected, user: hub.user, version: VERSION })
			return
		}

		if (path === '/relay') {
			await handleRelay(request, response)
			return
		}

		if (path !== '/mcp') {
			response.writeHead(404).end('Not found')
			return
		}

		// Stateless: one server + transport per request. Tool calls carry all their state in
		// arguments, so there is nothing worth keeping between requests.
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true
		})
		const server = createMcpServer(hub)

		try {
			await server.connect(transport)
			await transport.handleRequest(request, response, await readBody(request))
		} catch (error) {
			console.error('[jemi-mcp] request failed:', error)
			if (!response.headersSent) response.writeHead(500).end('Internal error')
		} finally {
			void server.close()
		}
	})

	// Upgrades are handled manually so a page from an unexpected origin never reaches the hub.
	const bridge = new WebSocketServer({ noServer: true })

	http.on('upgrade', (request, socket, head) => {
		const path = (request.url ?? '/').split('?')[0]
		const pageOrigin = request.headers.origin

		if (path !== '/bridge' || (pageOrigin && !allowedOrigins.has(pageOrigin))) {
			socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
			socket.destroy()
			return
		}

		bridge.handleUpgrade(request, socket, head, (ws) => bridge.emit('connection', ws))
	})

	bridge.on('connection', (ws) => {
		if (!hub.attach(ws)) {
			ws.send(JSON.stringify({ type: 'bye', reason: 'Another Jemi tab is already connected to MCP' }))
			ws.close()
			return
		}

		ws.on('message', (data) => hub.handleMessage(ws, data.toString()))
		ws.on('close', () => hub.detach(ws))
	})

	return http
}

/** Takes the bridge port, or reports that somebody else already has it. */
function listen(http: HttpServer): Promise<boolean> {
	return new Promise((resolve) => {
		http.once('error', (error: NodeJS.ErrnoException) => {
			if (error.code === 'EADDRINUSE') return resolve(false)
			throw error
		})
		http.listen(port, '127.0.0.1', () => resolve(true))
	})
}

const http = createLocalServer()
const owns = await listen(http)

if (transportMode === 'http') {
	if (!owns) {
		console.error(`[jemi-mcp] port ${port} is already taken by another @jemidev/mcp process`)
		process.exit(1)
	}
	console.error(`[jemi-mcp] ${origin}/mcp — waiting for a browser bridge`)
} else {
	// The browser can only reach one port, so the first process to start owns the bridge and the
	// rest forward to it. Either way this process speaks stdio to its own client.
	if (!owns) {
		http.close()
		console.error(`[jemi-mcp] relaying through the @jemidev/mcp process on ${origin}`)
	} else {
		console.error(`[jemi-mcp] stdio, holding the browser bridge on ${origin}`)
	}

	const server = createMcpServer(owns ? hub : new RemoteHub(origin))
	await server.connect(new StdioServerTransport())
}
