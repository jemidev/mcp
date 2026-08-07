import {
	MCP_OPERATION_TIMEOUT_MS,
	MCP_PROTOCOL_VERSION,
	parseFrame,
	type TMcpBridgeFrame,
	type TMcpError,
	type TMcpOperationName,
	type TMcpParams,
	type TMcpResult
} from '../protocol'

/**
 * The hub only ever writes to the socket, so it accepts anything that can send and close.
 * That keeps it independent of the WebSocket implementation underneath.
 */
export type BridgeSocket = { send(data: string): void; close(): void }

export class McpBridgeError extends Error {
	constructor(readonly detail: TMcpError) {
		super(detail.message)
		this.name = detail.code
	}
}

type PendingCall = {
	resolve: (value: unknown) => void
	reject: (error: McpBridgeError) => void
	timer: ReturnType<typeof setTimeout>
}

export type BridgeIdentity = { id: string; displayName: string }

/**
 * Owns the single browser bridge connection and correlates requests with responses.
 *
 * Only one bridge may be attached at a time: every operation targets "the tab the user is
 * looking at", and with two tabs connected there would be no way to say which one that is.
 * Later connections are rejected rather than silently queued.
 */
export class BridgeHub {
	private socket: BridgeSocket | null = null
	private identity: BridgeIdentity | null = null
	private readonly pending = new Map<string, PendingCall>()

	get connected(): boolean {
		return this.socket !== null && this.identity !== null
	}

	get user(): BridgeIdentity | null {
		return this.identity
	}

	/** Returns false when another bridge already holds the slot — caller should close the socket. */
	attach(socket: BridgeSocket): boolean {
		if (this.socket) return false
		this.socket = socket
		return true
	}

	detach(socket: BridgeSocket): void {
		if (this.socket !== socket) return
		this.socket = null
		this.identity = null
		this.failAll({ code: 'BRIDGE_UNAVAILABLE', message: 'Bridge disconnected' })
	}

	handleMessage(socket: BridgeSocket, raw: string): void {
		const frame = parseFrame(raw) as TMcpBridgeFrame | null
		if (!frame) return

		switch (frame.type) {
			case 'hello': {
				if (frame.protocolVersion !== MCP_PROTOCOL_VERSION) {
					socket.send(
						JSON.stringify({
							type: 'bye',
							reason: `Protocol mismatch: server speaks v${MCP_PROTOCOL_VERSION}, bridge speaks v${frame.protocolVersion}`
						})
					)
					socket.close()
					return
				}
				this.identity = frame.user
				socket.send(JSON.stringify({ type: 'hello_ack', protocolVersion: MCP_PROTOCOL_VERSION }))
				console.error(`[bridge] connected as ${frame.user.displayName} (app ${frame.appVersion})`)
				return
			}
			case 'response': {
				const call = this.pending.get(frame.id)
				if (!call) return
				clearTimeout(call.timer)
				this.pending.delete(frame.id)
				if (frame.ok) call.resolve(frame.result)
				else call.reject(new McpBridgeError(frame.error))
				return
			}
			case 'bye': {
				console.error(`[bridge] disconnecting: ${frame.reason}`)
				socket.close()
				return
			}
		}
	}

	async call<K extends TMcpOperationName>(op: K, params: TMcpParams<K>): Promise<TMcpResult<K>> {
		const socket = this.socket
		if (!socket || !this.identity) {
			throw new McpBridgeError({
				code: 'BRIDGE_UNAVAILABLE',
				message: 'No Jemi tab is connected. Open Jemi in a browser and enable the MCP extension.'
			})
		}

		const id = crypto.randomUUID()
		const result = new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id)
				reject(new McpBridgeError({ code: 'TIMEOUT', message: `Operation ${op} timed out` }))
			}, MCP_OPERATION_TIMEOUT_MS)
			this.pending.set(id, { resolve, reject, timer })
		})

		socket.send(JSON.stringify({ type: 'request', id, op, params }))
		return (await result) as TMcpResult<K>
	}

	private failAll(error: TMcpError): void {
		for (const [, call] of this.pending) {
			clearTimeout(call.timer)
			call.reject(new McpBridgeError(error))
		}
		this.pending.clear()
	}
}
