import { c, cli } from '@celados/argc'
import { toStandardJsonSchema } from '@valibot/to-json-schema'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import * as v from 'valibot'

import packageJson from '../package.json' with { type: 'json' }
import { embedSkill } from './skill.embed.ts' with { type: 'macro' }

const s = toStandardJsonSchema

const contextSchema = v.object({
	manifest: v.optional(v.string(), 'icons.json'),
})

export type AppContext = v.InferOutput<typeof contextSchema>

export type RuntimeContext = {
	manifestPath: string
	vendorRoot: string
}

export function runtimeContext(context: AppContext): RuntimeContext {
	return {
		manifestPath: resolve(context.manifest),
		// The vendor cache is user-level by design: projects share one copy and
		// never receive a transient node_modules-like directory.
		vendorRoot: join(
			process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'),
			'sigil',
			'icons',
		),
	}
}

// Refs stay domain identifiers (`set/name`); command syntax is always an object.
export const schema = {
	use: c
		.meta({
			description:
				'Declare icon libraries for this project and vendor them locally. Empty input lists supported sources.',
			examples: [
				"sigil use \"{ sets: ['lucide', 'svgl'] }\"",
				"sigil use \"{ sets: ['ph'], variant: 'duotone' }\"",
			],
		})
		.input(
			s(
				v.object({
					sets: v.optional(v.array(v.string()), []),
					variant: v.optional(v.string()),
					prefix: v.optional(v.string()),
					cssMode: v.optional(v.picklist(['mask', 'image'])),
				}),
			),
		),

	sources: c
		.meta({
			description:
				'List supported icon sources. Bundled sources vendor locally; every other Iconify set is supported through the API fallback.',
			examples: ["sigil sources '{}'"],
		})
		.input(s(v.object({}))),

	search: c
		.meta({
			description:
				'Search icons. Default scope: libraries declared via use (local, offline); all searches the full Iconify index for discovery.',
			examples: [
				'sigil search "{ query: \'house\' }"',
				'sigil search "{ query: \'github\', all: true }"',
				"sigil search \"{ query: 'home', set: 'lucide' }\"",
			],
		})
		.input(
			s(
				v.object({
					query: v.string(),
					set: v.optional(v.string()),
					all: v.optional(v.boolean(), false),
					limit: v.optional(
						v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999)),
						64,
					),
				}),
			),
		),

	add: c
		.meta({
			description:
				'Add icon refs to the manifest. Vendors each icon set locally and validates existence.',
			examples: [
				"sigil add \"{ refs: ['lucide/house', 'lucide/menu', 'simple-icons/github'] }\"",
				"sigil add \"{ refs: ['simple-icons/github'], as: 'GithubBrand' }\"",
			],
		})
		.input(
			s(
				v.object({
					refs: v.pipe(v.array(v.string()), v.minLength(1)),
					as: v.optional(v.string()),
				}),
			),
		),

	// 使用者是 agent:不设 rm/ls 这类人类向 alias,全名即一个 token
	remove: c
		.meta({
			description:
				'Remove icons from the manifest. A bare set name (no /) removes the whole library declaration.',
			examples: [
				'sigil remove "{ refs: [\'lucide/house\'] }"',
				'sigil remove "{ refs: [\'svgl\'] }"',
			],
		})
		.input(s(v.object({ refs: v.pipe(v.array(v.string()), v.minLength(1)) }))),

	list: c
		.meta({
			description: 'List manifest icons and their component names',
			examples: ["sigil list '{}'"],
		})
		.input(s(v.object({}))),

	etch: c
		.meta({
			description:
				'Generate icon files from the manifest. Without format or jsx dumps one .svg per icon; format css emits a stylesheet, while jsx emits a component module.',
			examples: [
				'sigil etch "{ output: \'public/svg\' }"',
				"sigil etch \"{ output: 'public/icons.css', format: 'css' }\"",
				"sigil etch \"{ output: 'src/components/icons.tsx', jsx: 'react' }\"",
				"sigil etch \"{ output: 'src/components', jsx: 'solid' }\"",
				"sigil etch \"{ output: 'src/components', jsx: 'octane', atlas: true }\"",
			],
		})
		.input(
			s(
				v.object({
					output: v.string(),
					format: v.optional(v.picklist(['css'])),
					jsx: v.optional(v.picklist(['react', 'solid', 'octane', 'tsrx'])),
					atlas: v.optional(v.boolean(), false),
				}),
			),
		),
}

export const app = cli(schema, {
	name: 'sigil',
	version: packageJson.version,
	description: 'Agent-friendly icon package manager: search → add → etch',
	context: s(contextSchema),
	skill: embedSkill(),
})

export type AppHandlers = typeof app.Handlers
