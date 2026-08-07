#!/usr/bin/env node
import {
	createServer as createHttpServer,
	type IncomingMessage,
	type ServerResponse
} from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { WebSocketServer } from 'ws'

import { MCP_DEFAULT_HTTP_PORT } from '../protocol'
import { BridgeHub } from './bridge'
import { registerTools } from './tools'
import { VERSION } from './version'

const port = Number(process.env.JEMI_MCP_PORT ?? MCP_DEFAULT_HTTP_PORT)

// Origins allowed to attach a bridge. A hostile page can otherwise connect to the local port and
// impersonate the user's tab — it could not read anything (it has no keys) but it could feed the
// assistant fabricated project data.
const allowedOrigins = new Set(
	(process.env.JEMI_MCP_ALLOWED_ORIGINS ?? 'https://app.jemi.dev')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean)
)

const hub = new BridgeHub()

function createMcpServer(): McpServer {
	const server = new McpServer(
		{ name: 'jemi', version: VERSION },
		{
			instructions:
				"Jemi project management. Every call is executed inside the user's browser tab, so encrypted content is readable only while that tab is open. Results are JSON. Always resolve ids via jemi_list_projects → jemi_list_channels before acting, except when the user names a task by its number (ALP-0254) — then use jemi_find_task_by_key directly. Prefer the filters on jemi_list_tasks and the bulk tools over repeating a single-item call."
		}
	)
	registerTools(server, hub)
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

const http = createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
	const path = (request.url ?? '/').split('?')[0]

	if (path === '/health') {
		response.writeHead(200, { 'content-type': 'application/json' })
		response.end(JSON.stringify({ bridge: hub.connected, user: hub.user, version: VERSION }))
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
	const server = createMcpServer()

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
	const origin = request.headers.origin

	if (path !== '/bridge' || (origin && !allowedOrigins.has(origin))) {
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

http.listen(port, '127.0.0.1', () => {
	console.error(`[jemi-mcp] http://127.0.0.1:${port}/mcp — waiting for a browser bridge`)
})
