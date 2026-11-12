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
				'Declare icon libraries for this project and vendor them locally. Empty input lists supported sources',
		})
		.input(
			s(
				v.object({
					sets: v.optional(v.array(v.string()), []),
					variant: v.optional(v.string()),
					cssMode: v.optional(v.picklist(['mask', 'image'])),
				}),
			),
		),

	sources: c
		.meta({
			description:
				'List supported icon sources; any other Iconify set works through the API fallback',
		})
		.input(s(v.object({}))),

	search: c
		.meta({
			description:
				"Search icons: declared libraries by default, one library by set ID, or '*' for global Iconify discovery",
		})
		.input(
			s(
				v.object({
					query: v.string(),
					set: v.optional(v.union([v.literal('*'), v.string()])),
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
				'Add icon refs to the manifest, vendoring each set locally and validating the icon exists',
		})
		.input(
			s(
				v.object({
					refs: v.pipe(v.array(v.string()), v.minLength(1)),
					as: v.optional(v.string()),
				}),
			),
		),

	preset: c
		.meta({
			description:
				'Fill a preset of semantic icon slots (Icon<Slot>) from one library; re-running with another set swaps them in place. Empty input lists presets',
			examples: [
				"sigil preset \"{ name: 'ff', set: 'tabler', slots: ['search', 'chevron-right'] }\"",
			],
		})
		.input(
			s(
				v.object({
					name: v.optional(v.picklist(['ff'])),
					set: v.optional(v.string()),
					slots: v.optional(v.array(v.string())),
				}),
			),
		),

	// 使用者是 agent:不设 rm/ls 这类人类向 alias,全名即一个 token
	remove: c
		.meta({
			description:
				'Remove icons from the manifest. A bare set name removes the whole library',
		})
		.input(s(v.object({ refs: v.pipe(v.array(v.string()), v.minLength(1)) }))),

	list: c
		.meta({
			description: 'List manifest icons and their component names',
		})
		.input(s(v.object({}))),

	etch: c
		.meta({
			description:
				'Generate icon files from the manifest: one .svg per icon, a CSS stylesheet (format) or component modules (jsx). Renderer semantics: sigil @skill references/outputs.md',
			examples: [
				"sigil etch \"{ output: 'src/components', jsx: 'octane', atlas: true }\"",
				"sigil etch \"{ output: 'src/components/icons', jsx: 'react', modules: true }\"",
			],
		})
		.input(
			s(
				v.object({
					output: v.string(),
					format: v.optional(v.picklist(['css'])),
					jsx: v.optional(
						v.pipe(
							v.picklist(['react', 'solid', 'octane', 'tsrx', 'pencil']),
							v.description(
								'Component target; pencil emits @celados/pencil Path nodes for pen.dev designs',
							),
						),
					),
					atlas: v.optional(
						v.pipe(
							v.boolean(),
							v.description(
								'Also emit a sidecar searchable IconAtlas preview component (any jsx target)',
							),
						),
						false,
					),
					modules: v.optional(
						v.pipe(
							v.boolean(),
							v.description(
								'One module per icon plus a barrel, for code-split apps (react/solid, directory output, no atlas)',
							),
						),
						false,
					),
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
