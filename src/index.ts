#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FlatEntry, Manifest } from './manifest.ts'
import type { IconRef } from './ref.ts'
import type { NamedIcon } from './render/types.ts'

import {
	assertNoCollisions,
	componentName,
	defaultManifest,
	effectiveName,
	entryName,
	flatten,
	loadManifest,
	saveManifest,
} from './manifest.ts'
import { expandRefArgs, formatRef, kebabCase, parseRef } from './ref.ts'
import { renderers } from './render/registry.ts'
import { resolveRefs } from './resolve.ts'
import { app } from './schema.ts'
import { iconifySource } from './source/iconify.ts'
import { bundledSourceSets, sourceFor } from './source/registry.ts'

function fail(message: string): never {
	console.error(`sigil: ${message}`)
	process.exit(1)
}

/** 网络/API 错误统一收口为 CLI 错误消息,不漏 stack trace */
async function attempt<T>(promise: Promise<T>): Promise<T> {
	try {
		return await promise
	} catch (e) {
		fail((e as Error).message)
	}
}

/** Set 级 prefix 覆盖 > adapter 前缀 */
function prefixFor(manifest: Manifest, vendorRoot: string) {
	return (set: string): string =>
		manifest[set]?.prefix ?? sourceFor(set, vendorRoot).prefix(set)
}

/** Base 名 + set.variant → 上游实际 ref */
function effectiveRef(
	manifest: Manifest,
	entry: FlatEntry,
	vendorRoot: string,
): IconRef {
	const name = effectiveName(
		entry.name,
		manifest[entry.set]?.variant,
		sourceFor(entry.set, vendorRoot).defaultVariant,
	)
	return { set: entry.set, name }
}

function nameFor(
	manifest: Manifest,
	entry: FlatEntry,
	vendorRoot: string,
): string {
	return componentName(entry, prefixFor(manifest, vendorRoot)(entry.set))
}

/** 解析 manifest 全量;任何缺失 → 原子失败,不产出任何文件 */
async function resolveManifest(
	manifest: Manifest,
	vendorRoot: string,
): Promise<NamedIcon[]> {
	const entries = flatten(manifest)
	try {
		assertNoCollisions(entries, prefixFor(manifest, vendorRoot))
	} catch (e) {
		fail((e as Error).message)
	}
	const refs = entries.map((entry) => effectiveRef(manifest, entry, vendorRoot))
	const { icons, missing } = await attempt(resolveRefs(refs, vendorRoot))
	if (missing.length > 0) {
		fail(
			`missing upstream: ${missing.map(formatRef).join(', ')}\n` +
				`  fix the name/variant or run \`sigil remove <ref>\``,
		)
	}
	const byRef = new Map(icons.map((icon) => [formatRef(icon.ref), icon]))
	return entries.map((entry, i) => {
		const resolved = byRef.get(formatRef(refs[i]!))!
		const component = nameFor(manifest, entry, vendorRoot)
		return {
			...resolved,
			componentName: component,
			fileName: kebabCase(component),
		}
	})
}

function sourceRows(vendorRoot: string) {
	const bundled = bundledSourceSets.map((set) => {
		const source = sourceFor(set, vendorRoot)
		return {
			set,
			prefix: source.prefix(set),
			...(source.defaultVariant
				? { defaultVariant: source.defaultVariant }
				: {}),
			mode: 'bundled' as const,
		}
	})
	return {
		bundled,
		fallback: {
			set: '<iconify-set>',
			prefix: 'derived',
			mode: 'iconify-api' as const,
		},
	}
}

function printSources(vendorRoot: string, json = false) {
	const sources = sourceRows(vendorRoot)
	if (json) {
		console.log(JSON.stringify(sources))
		return
	}

	console.log('Bundled sources (vendored locally after `sigil use <set>`):')
	const width = Math.max(...sources.bundled.map((source) => source.set.length))
	for (const source of sources.bundled) {
		const annotations = [
			source.prefix,
			...(source.defaultVariant
				? [`defaultVariant=${source.defaultVariant}`]
				: []),
		].join(' · ')
		console.log(`  ${source.set.padEnd(width)}  ${annotations}`)
	}
	console.log('')
	console.log('Fallback:')
	console.log(
		'  <iconify-set>  any Iconify collection via API; prefix is derived',
	)
}

app.run({
	handlers: {
		use: async ({ input, context }) => {
			if (input.sets.length === 0) {
				if (input.variant || input.prefix) {
					fail('--variant/--prefix require a set')
				}
				printSources(context.vendorRoot)
				return
			}
			if ((input.variant || input.prefix) && input.sets.length !== 1) {
				fail('--variant/--prefix require exactly one set')
			}
			const manifest = loadManifest(context.manifestPath) ?? defaultManifest()
			for (const set of input.sets) {
				if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(set)) {
					fail(`invalid set name "${set}"`)
				}
				const config = (manifest[set] ??= { icons: [] })
				if (input.variant) config.variant = input.variant
				if (input.prefix) config.prefix = input.prefix
			}
			saveManifest(context.manifestPath, manifest)
			// use = 显式 provision:并发 clone 全部声明的库
			await attempt(
				Promise.all(
					input.sets.map((set) =>
						sourceFor(set, context.vendorRoot).vendor?.(),
					),
				),
			)
			for (const set of input.sets) {
				const source = sourceFor(set, context.vendorRoot)
				const mode = source.vendored?.() ? 'vendored' : 'via iconify API'
				console.log(
					`+ using ${set} (${manifest[set]?.prefix ?? source.prefix(set)}) · ${mode}`,
				)
			}
		},

		sources: async ({ input, context }) => {
			printSources(context.vendorRoot, input.json)
		},

		search: async ({ input, context }) => {
			const manifest = loadManifest(context.manifestPath)
			const used = manifest ? Object.keys(manifest) : []

			let results
			let footer: string | null = null
			if (input.set) {
				// 显式单库:已 vendor 走本地(含 API 隐藏的 deprecated 图标),否则 API
				const local = sourceFor(input.set, context.vendorRoot)
				const source = local.vendored?.() ? local : iconifySource
				results = [
					await attempt(
						source.search(input.query, {
							set: input.set,
							limit: input.limit,
						}),
					),
				]
			} else if (input.all || used.length === 0) {
				// 显式全局,或冷项目(尚未 use 任何库)→ iconify 全索引发现
				results = [
					await attempt(
						iconifySource.search(input.query, { limit: input.limit }),
					),
				]
				if (used.length === 0) {
					footer =
						'# no libraries declared · searched all of iconify (`sigil use <set>` to pin)'
				}
			} else {
				// 默认作用域 = 已 use 的库:vendored 的并发本地搜,
				// 长尾(无专属 adapter)打包一次 iconify prefixes 查询
				const localSets = used.filter((s) =>
					sourceFor(s, context.vendorRoot).vendored?.(),
				)
				const apiSets = used.filter((s) => !localSets.includes(s))
				results = await attempt(
					Promise.all([
						...localSets.map((s) =>
							sourceFor(s, context.vendorRoot).search(input.query, {
								limit: input.limit,
							}),
						),
						...(apiSets.length
							? [
									iconifySource.search(input.query, {
										sets: apiSets,
										limit: input.limit,
									}),
								]
							: []),
					]),
				)
				footer = `# scope: ${used.join(', ')} · --all for global discovery`
			}

			const hits = results.flatMap((r) => r.hits)
			const total = results.reduce((n, r) => n + r.total, 0)
			const sets = Object.assign(
				{},
				...results.map((r) => r.sets),
			) as (typeof results)[number]['sets']

			if (input.json) {
				console.log(JSON.stringify({ icons: hits.map(formatRef), total, sets }))
				return
			}
			if (hits.length === 0) {
				console.error(
					`no icons found for "${input.query}"${footer?.includes('scope') ? ' in declared libraries — try --all' : ''}`,
				)
				process.exit(1)
			}
			const bySet = new Map<string, string[]>()
			for (const hit of hits) {
				const names = bySet.get(hit.set) ?? []
				names.push(hit.name)
				bySet.set(hit.set, names)
			}
			const width = Math.max(...[...bySet.keys()].map((s) => s.length))
			for (const [set, names] of bySet) {
				const license = sets[set]?.license
				console.log(
					`${set.padEnd(width)}  ${names.join(', ')}${license ? `  · ${license}` : ''}`,
				)
			}
			if (total > hits.length) {
				console.log(
					`# ${hits.length}/${total} shown · narrow with --set <set> or raise --limit`,
				)
			}
			if (footer) console.log(footer)
		},

		add: async ({ input, context }) => {
			let refs
			try {
				refs = expandRefArgs(input.refs).map(parseRef)
			} catch (e) {
				fail((e as Error).message)
			}
			if (input.as && refs.length !== 1) {
				fail('--as requires exactly one ref')
			}

			const manifest = loadManifest(context.manifestPath) ?? defaultManifest()
			const fresh = refs.filter(
				(ref) =>
					!manifest[ref.set]?.icons.some((x) => entryName(x) === ref.name),
			)
			const skipped = refs.length - fresh.length
			// add 是便利路径:未 use 的库自动声明(use 是正路),提示走 stderr
			const autoUsed = [...new Set(fresh.map((r) => r.set))].filter(
				(set) => !manifest[set],
			)

			if (fresh.length > 0) {
				// 像 pnpm add:先 vendor(shallow clone 进 node_modules/.icons)
				// 再按 effective 名(含 set.variant)校验存在性,manifest 里不留死引用
				const checkRefs = fresh.map((ref) =>
					effectiveRef(
						manifest,
						{ set: ref.set, name: ref.name },
						context.vendorRoot,
					),
				)
				const { missing } = await attempt(
					resolveRefs(checkRefs, context.vendorRoot),
				)
				if (missing.length > 0) {
					fail(
						`not found: ${missing.map(formatRef).join(', ')}\n` +
							`  try \`sigil search <query>\` to find the right name`,
					)
				}
				for (const ref of fresh) {
					const config = (manifest[ref.set] ??= { icons: [] })
					config.icons.push(
						input.as ? { name: ref.name, as: input.as } : ref.name,
					)
				}
			}

			try {
				assertNoCollisions(
					flatten(manifest),
					prefixFor(manifest, context.vendorRoot),
				)
			} catch (e) {
				fail((e as Error).message)
			}
			saveManifest(context.manifestPath, manifest)

			for (const ref of fresh) {
				const entry: FlatEntry = input.as
					? { set: ref.set, name: ref.name, as: input.as }
					: { set: ref.set, name: ref.name }
				console.log(
					`+ ${formatRef(ref)} → ${nameFor(manifest, entry, context.vendorRoot)}`,
				)
			}
			for (const set of autoUsed) {
				console.error(
					`# using ${set} (auto-declared — \`sigil use\` is the explicit way)`,
				)
			}
			if (skipped > 0) console.error(`# ${skipped} already in manifest`)
		},

		remove: async ({ input, context }) => {
			const manifest =
				loadManifest(context.manifestPath) ?? fail('no manifest found')
			// 裸 set 名(无 /)= 删除整个库声明;带 / 的是单个图标
			const tokens = input.refs.flatMap((arg) => arg.split(',')).filter(Boolean)
			const bareSets = tokens.filter((t) => !/[/:]/.test(t))
			let refs
			try {
				refs = expandRefArgs(tokens.filter((t) => /[/:]/.test(t))).map(parseRef)
			} catch (e) {
				fail((e as Error).message)
			}
			let removed = 0
			const notFound: string[] = []
			for (const set of bareSets) {
				if (manifest[set]) {
					removed += manifest[set].icons.length
					delete manifest[set]
					console.log(`- removed library ${set}`)
				} else {
					notFound.push(set)
				}
			}
			for (const ref of refs) {
				const config = manifest[ref.set]
				const before = config?.icons.length ?? 0
				if (config) {
					config.icons = config.icons.filter((x) => entryName(x) !== ref.name)
				}
				const after = config?.icons.length ?? 0
				if (before === after) notFound.push(formatRef(ref))
				removed += before - after
			}
			saveManifest(context.manifestPath, manifest)
			console.log(`- removed ${removed}`)
			if (notFound.length > 0) {
				console.error(`# not in manifest: ${notFound.join(', ')}`)
			}
		},

		list: async ({ input, context }) => {
			const manifest = loadManifest(context.manifestPath)
			const used = manifest ? Object.keys(manifest) : []
			if (!manifest || used.length === 0) {
				if (input.json) {
					console.log(JSON.stringify({ libraries: [], icons: [] }))
					return
				}
				console.error('manifest is empty — run `sigil use <set>`')
				return
			}
			const libraries = used.map((set) => ({
				set,
				...(manifest[set]?.variant ? { variant: manifest[set].variant } : {}),
				prefix:
					manifest[set]?.prefix ??
					sourceFor(set, context.vendorRoot).prefix(set),
			}))
			const entries = flatten(manifest)
			const rows = entries.map((entry) => {
				const eff = effectiveRef(manifest, entry, context.vendorRoot)
				return {
					id: `${entry.set}/${entry.name}`,
					resolved: formatRef(eff),
					...(entry.as ? { as: entry.as } : {}),
					component: nameFor(manifest, entry, context.vendorRoot),
				}
			})
			if (input.json) {
				console.log(JSON.stringify({ libraries, icons: rows }))
				return
			}
			for (const lib of libraries) {
				const annotations = [
					lib.prefix,
					...(lib.variant ? [`variant=${lib.variant}`] : []),
				].join(' · ')
				console.log(`${lib.set} (${annotations})`)
				const libRows = rows.filter((r) => r.id.startsWith(`${lib.set}/`))
				if (libRows.length === 0) {
					console.log('  (no icons)')
					continue
				}
				const width = Math.max(...libRows.map((r) => r.resolved.length))
				for (const row of libRows) {
					console.log(`  ${row.resolved.padEnd(width)}  ${row.component}`)
				}
			}
		},

		etch: async ({ input, context }) => {
			const manifest = loadManifest(context.manifestPath)
			if (!manifest || flatten(manifest).length === 0) {
				fail('manifest is empty — run `sigil add <set>/<name>` first')
			}
			const named = await resolveManifest(manifest, context.vendorRoot)
			const renderer = renderers[input.jsx ?? 'svg']!
			const files = renderer.render(named)

			if (renderer.defaultFile) {
				// format 由 --jsx 决定,path 只管位置:带代码扩展名视为文件,否则视为目录
				const out = /\.(tsrx|[cm]?[tj]sx?)$/.test(input.output)
					? input.output
					: join(input.output, renderer.defaultFile)
				mkdirSync(dirname(out), { recursive: true })
				writeFileSync(out, files[0]!.content)
				console.log(`etched ${named.length} icons → ${out}`)
			} else {
				mkdirSync(input.output, { recursive: true })
				for (const file of files) {
					writeFileSync(join(input.output, file.path), file.content)
				}
				console.log(`etched ${files.length} icons → ${input.output}/`)
			}
		},
	},
})
