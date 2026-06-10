import { toStandardJsonSchema } from '@valibot/to-json-schema'
import { c, cli } from 'argc'
import { dirname, join, resolve } from 'node:path'
import * as v from 'valibot'

const s = toStandardJsonSchema

// ref 语法统一为 <set>/<name>(也接受 <set>:<name>)
export const schema = {
	use: c
		.meta({
			description:
				'Declare icon libraries for this project and vendor them locally. Later search/add/etch run against these libraries offline.',
			examples: [
				'sigil use lucide',
				'sigil use lucide svgl',
				'sigil use ph --variant duotone',
			],
		})
		.args('sets...')
		.input(
			s(
				v.object({
					sets: v.pipe(v.array(v.string()), v.minLength(1)),
					variant: v.optional(v.string()),
					prefix: v.optional(v.string()),
				}),
			),
		),

	search: c
		.meta({
			description:
				'Search icons. Default scope: libraries declared via `use` (local, offline). --all searches the full Iconify index (200+ sets) for discovery.',
			examples: [
				'sigil search house',
				'sigil search github --all',
				'sigil search home --set lucide --json',
			],
		})
		.args('query')
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
					json: v.optional(v.boolean(), false),
				}),
			),
		),

	add: c
		.meta({
			description:
				'Add icons to the manifest. Vendors the icon set locally and validates existence. Ref DSL: "+" joins icons, "," (or space) separates sets',
			examples: [
				'sigil add lucide/house',
				'sigil add lucide/house+menu,simple-icons/github',
				'sigil add simple-icons/github --as GithubBrand',
			],
		})
		.args('refs...')
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
			examples: ['sigil remove lucide/house', 'sigil remove svgl'],
		})
		.args('refs...')
		.input(s(v.object({ refs: v.pipe(v.array(v.string()), v.minLength(1)) }))),

	list: c
		.meta({
			description: 'List manifest icons and their component names',
		})
		.input(s(v.object({ json: v.optional(v.boolean(), false) }))),

	etch: c
		.meta({
			description:
				'Generate icon files from the manifest. Without --jsx dumps one .svg per icon; with --jsx emits a single component module.',
			examples: [
				'sigil etch --output public/svg',
				'sigil etch --output src/components/icons.tsx --jsx react',
				'sigil etch --output src/components --jsx solid',
			],
		})
		.input(
			s(
				v.object({
					output: v.string(),
					jsx: v.optional(v.picklist(['react', 'solid'])),
				}),
			),
		),
}

export const app = cli(schema, {
	name: 'sigil',
	version: '0.1.0',
	description: 'Agent-friendly icon package manager: search → add → etch',
	globals: s(
		v.object({
			manifest: v.optional(v.string(), 'icons.json'),
		}),
	),
	context: (globals) => {
		const manifestPath = resolve(globals.manifest)
		return {
			manifestPath,
			// vendor 落在 node_modules 下:随项目走、天然被 gitignore
			vendorRoot: join(dirname(manifestPath), 'node_modules', '.icons'),
		}
	},
})

export type AppHandlers = typeof app.Handlers
