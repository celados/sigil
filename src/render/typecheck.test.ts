import { expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { NamedIcon } from './types.ts'

import { renderers } from './registry.ts'

const root = join(import.meta.dir, '../..')

const icon: NamedIcon = {
	ref: { set: 'lucide', name: 'house' },
	body: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><circle cx="12" cy="12" r="10"/>',
	viewBox: '0 0 24 24',
	componentName: 'IconHouse',
	attrs: { fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
	fileName: 'house',
}

// Generated modules are only useful if they compile against the framework
// versions apps run: Solid 2 and the published @celados/pencil.
const targets = {
	solid: {
		jsx: { jsx: 'preserve', jsxImportSource: '@solidjs/web' },
		usage: `import { IconHouse } from './icons.tsx'\nexport const App = () => <IconHouse size={16} class="x" strokeWidth={1.5} />\n`,
		atlas: true,
	},
	pencil: {
		jsx: { jsx: 'react-jsx', jsxImportSource: '@celados/pencil' },
		usage: `import { IconHouse } from './icons.tsx'\nexport default <IconHouse id="home" size={16} color="#111827" strokeWidth={1.5} />\n`,
		atlas: false,
	},
} as const

for (const [id, target] of Object.entries(targets)) {
	test(`${id} output typechecks`, () => {
		const dir = join(root, '.scratch/typecheck', id)
		mkdirSync(dir, { recursive: true })
		const files = renderers[id]!.render([icon], {
			atlas: target.atlas,
			atlasImportPath: './icons.tsx',
		})
		for (const file of files) writeFileSync(join(dir, file.path), file.content)
		writeFileSync(join(dir, 'usage.tsx'), target.usage)
		writeFileSync(
			join(dir, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'esnext',
					module: 'esnext',
					moduleResolution: 'bundler',
					allowImportingTsExtensions: true,
					strict: true,
					noEmit: true,
					skipLibCheck: true,
					types: [],
					lib: ['esnext', 'dom'],
					...target.jsx,
				},
				include: ['*.tsx'],
			}),
		)
		const proc = Bun.spawnSync([join(root, 'node_modules/.bin/tsc'), '-p', dir])
		expect(proc.stdout.toString()).toBe('')
		expect(proc.exitCode).toBe(0)
	}, 60_000)
}
