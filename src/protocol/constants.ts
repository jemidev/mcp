/** Wire protocol version for "MCP server ↔ browser bridge". Mismatched sides refuse the handshake. */
export const MCP_PROTOCOL_VERSION = 1

export const MCP_DEFAULT_HTTP_PORT = 4401
export const MCP_DEFAULT_WS_PORT = 4402

/** How long the bridge has to complete one operation before the server returns a timeout. */
export const MCP_OPERATION_TIMEOUT_MS = 30_000

export const MCP_ERROR_CODES = [
	'BRIDGE_UNAVAILABLE',
	'BRIDGE_BUSY',
	'PROTOCOL_MISMATCH',
	'NOT_FOUND',
	'FORBIDDEN',
	'DECRYPTION_FAILED',
	'INVALID_PARAMS',
	'TIMEOUT',
	'INTERNAL'
] as const

export type TMcpErrorCode = (typeof MCP_ERROR_CODES)[number]
