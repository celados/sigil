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
import { sourceFor } from './source/registry.ts'

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

app.run({
	handlers: {
		search: async ({ input, context }) => {
			// --set 命中专属 adapter 且已 vendor → 本地搜索(含 API 隐藏的
			// deprecated 图标);否则 iconify API 全局发现
			const local = input.set
				? sourceFor(input.set, context.vendorRoot)
				: iconifySource
			const source = local.vendored?.() ? local : iconifySource
			const result = await attempt(
				source.search(input.query, {
					...(input.set ? { set: input.set } : {}),
					limit: input.limit,
				}),
			)
			if (input.json) {
				console.log(
					JSON.stringify({
						icons: result.hits.map(formatRef),
						total: result.total,
						sets: result.sets,
					}),
				)
				return
			}
			if (result.hits.length === 0) {
				console.error(`no icons found for "${input.query}"`)
				process.exit(1)
			}
			const bySet = new Map<string, string[]>()
			for (const hit of result.hits) {
				const names = bySet.get(hit.set) ?? []
				names.push(hit.name)
				bySet.set(hit.set, names)
			}
			const width = Math.max(...[...bySet.keys()].map((s) => s.length))
			for (const [set, names] of bySet) {
				const license = result.sets[set]?.license
				console.log(
					`${set.padEnd(width)}  ${names.join(', ')}${license ? `  · ${license}` : ''}`,
				)
			}
			if (result.total > result.hits.length) {
				console.log(
					`# ${result.hits.length}/${result.total} shown · narrow with --set <set> or raise --limit`,
				)
			}
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
			if (skipped > 0) console.error(`# ${skipped} already in manifest`)
		},

		remove: async ({ input, context }) => {
			const manifest =
				loadManifest(context.manifestPath) ?? fail('no manifest found')
			let refs
			try {
				refs = expandRefArgs(input.refs).map(parseRef)
			} catch (e) {
				fail((e as Error).message)
			}
			let removed = 0
			const notFound: string[] = []
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
			const entries = manifest ? flatten(manifest) : []
			if (!manifest || entries.length === 0) {
				if (input.json) {
					console.log(JSON.stringify({ icons: [] }))
					return
				}
				console.error('manifest is empty — run `sigil add <set>/<name>`')
				return
			}
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
				console.log(JSON.stringify({ icons: rows }))
				return
			}
			const width = Math.max(...rows.map((r) => r.resolved.length))
			for (const row of rows) {
				console.log(`${row.resolved.padEnd(width)}  ${row.component}`)
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
				const out = /\.[cm]?[tj]sx?$/.test(input.output)
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
