import { rm } from 'node:fs/promises'
import pkg from '../package.json' with { type: 'json' }

await rm('dist', { recursive: true, force: true })

for (const [entry, name] of [
	['./src/server/cli.ts', 'cli.js'],
	['./src/protocol/index.ts', 'protocol.js']
] as const) {
	const result = await Bun.build({
		entrypoints: [entry],
		outdir: './dist',
		target: 'node',
		format: 'esm',
		external: Object.keys(pkg.dependencies),
		define: { __VERSION__: JSON.stringify(pkg.version) },
		naming: { entry: name }
	})

	if (!result.success) {
		for (const log of result.logs) console.error(log)
		process.exit(1)
	}
}

const types = Bun.spawnSync([
	'bunx',
	'tsc',
	'--emitDeclarationOnly',
	'--declaration',
	'--outDir',
	'dist/types',
	'--rootDir',
	'src',
	'src/protocol/index.ts'
])

if (types.exitCode !== 0) {
	console.error(types.stderr.toString() || types.stdout.toString())
	process.exit(1)
}

console.log(`built @jemidev/mcp v${pkg.version}`)
