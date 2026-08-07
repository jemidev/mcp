import type { TMcpErrorCode } from './constants'
import type { TMcpOperationName, TMcpParams, TMcpResult } from './operations'

// WebSocket frames between the MCP server and the browser bridge. One request is answered by
// exactly one response carrying the same `id`; unmatched responses are dropped.

export type TMcpError = {
	code: TMcpErrorCode
	message: string
}

/** Bridge announces itself right after the socket opens. */
export type TMcpHelloFrame = {
	type: 'hello'
	protocolVersion: number
	appVersion: string
	/** Shown in the server log so the user can tell which account the bridge is acting as. */
	user: { id: string; displayName: string }
}

/** Server accepts the bridge, or closes the socket with a `PROTOCOL_MISMATCH` error frame. */
export type TMcpHelloAckFrame = {
	type: 'hello_ack'
	protocolVersion: number
}

export type TMcpRequestFrame<K extends TMcpOperationName = TMcpOperationName> = {
	type: 'request'
	id: string
	op: K
	params: TMcpParams<K>
}

export type TMcpResponseFrame<K extends TMcpOperationName = TMcpOperationName> = {
	type: 'response'
	id: string
} & ({ ok: true; result: TMcpResult<K> } | { ok: false; error: TMcpError })

/** Sent by either side before closing so the peer can report a clean disconnect. */
export type TMcpByeFrame = {
	type: 'bye'
	reason: string
}

export type TMcpBridgeFrame = TMcpHelloFrame | TMcpResponseFrame | TMcpByeFrame
export type TMcpServerFrame = TMcpHelloAckFrame | TMcpRequestFrame | TMcpByeFrame
export type TMcpFrame = TMcpBridgeFrame | TMcpServerFrame

export function parseFrame(raw: string): TMcpFrame | null {
	try {
		const value: unknown = JSON.parse(raw)
		if (typeof value !== 'object' || value === null) return null
		if (typeof (value as { type?: unknown }).type !== 'string') return null
		return value as TMcpFrame
	} catch {
		return null
	}
}
