// `__VERSION__` is substituted at build time from package.json, so the MCP handshake reports the
// version that was actually shipped. The fallback keeps `bun run dev` working from source.
declare const __VERSION__: string

export const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev'
