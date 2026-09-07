#!/usr/bin/env bun
import { domainError } from '@celados/argc'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

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
import { formatRef, kebabCase, parseRef } from './ref.ts'
import { renderers } from './render/registry.ts'
import { resolveRefs } from './resolve.ts'
import { app, runtimeContext } from './schema.ts'
import { iconifySource } from './source/iconify.ts'
import { bundledSourceSets, sourceFor } from './source/registry.ts'

type DomainCode =
	| 'alias_requires_single_ref'
	| 'atlas_requires_component_renderer'
	| 'component_collision'
	| 'conflicting_renderers'
	| 'icon_not_found'
	| 'invalid_ref'
	| 'invalid_set'
	| 'manifest_empty'
	| 'manifest_missing'
	| 'missing_upstream'
	| 'render_failed'
	| 'set_options_require_single_set'
	| 'upstream_error'

function fail(code: DomainCode, message: string): never {
	throw domainError(code, message)
}

function atlasFileNameFor(out: string): string {
	const ext = extname(out)
	const base = basename(out, ext)
	return `${base}.atlas${ext}`
}

function importPathFor(out: string): string {
	const ext = extname(out)
	return `./${basename(out, ext)}`
}

/** 网络/API 错误统一收口为 CLI 错误消息,不漏 stack trace */
async function attempt<T>(promise: Promise<T>): Promise<T> {
	try {
		return await promise
	} catch (e) {
		fail('upstream_error', (e as Error).message)
	}
}

/** Set 级 prefix 覆盖 > adapter 前缀 */
function prefixFor(manifest: Manifest, vendorRoot: string) {
	return (set: string): string =>
		manifest[set]?.prefix ?? sourceFor(set, vendorRoot).prefix(set)
}

function cssModeFor(manifest: Manifest, set: string, vendorRoot: string) {
	return manifest[set]?.cssMode ?? sourceFor(set, vendorRoot).cssMode?.(set)
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
		fail('component_collision', (e as Error).message)
	}
	const refs = entries.map((entry) => effectiveRef(manifest, entry, vendorRoot))
	const { icons, missing } = await attempt(resolveRefs(refs, vendorRoot))
	if (missing.length > 0) {
		fail(
			'missing_upstream',
			`missing upstream: ${missing.map(formatRef).join(', ')}\n` +
				`  fix the name/variant or run \`sigil remove "{ refs: ['<ref>'] }"\``,
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
			cssMode: cssModeFor(manifest, entry.set, vendorRoot),
		}
	})
}

function sourceRows(vendorRoot: string) {
	const bundled = bundledSourceSets.map((set) => {
		const source = sourceFor(set, vendorRoot)
		const cssMode = source.cssMode?.(set)
		return {
			set,
			prefix: source.prefix(set),
			...(cssMode ? { cssMode } : {}),
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
			cssMode: 'manifest-required',
			mode: 'iconify-api' as const,
		},
	}
}

await app.run({
	handlers: {
		use: async ({ input, context }) => {
			const runtime = runtimeContext(context)
			if (input.sets.length === 0) {
				if (input.variant || input.prefix || input.cssMode) {
					fail(
						'set_options_require_single_set',
						'variant, prefix, and cssMode require exactly one set',
					)
				}
				return sourceRows(runtime.vendorRoot)
			}
			if (
				(input.variant || input.prefix || input.cssMode) &&
				input.sets.length !== 1
			) {
				fail(
					'set_options_require_single_set',
					'variant, prefix, and cssMode require exactly one set',
				)
			}
			const manifest = loadManifest(runtime.manifestPath) ?? defaultManifest()
			for (const set of input.sets) {
				if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(set)) {
					fail('invalid_set', `invalid set name "${set}"`)
				}
				const config = (manifest[set] ??= { icons: [] })
				if (input.variant) config.variant = input.variant
				if (input.prefix) config.prefix = input.prefix
				if (input.cssMode) config.cssMode = input.cssMode
			}
			saveManifest(runtime.manifestPath, manifest)
			// use = 显式 provision:并发 clone 全部声明的库
			await attempt(
				Promise.all(
					input.sets.map((set) =>
						sourceFor(set, runtime.vendorRoot).vendor?.(),
					),
				),
			)
			return {
				used: input.sets.map((set) => {
					const source = sourceFor(set, runtime.vendorRoot)
					return {
						set,
						prefix: manifest[set]?.prefix ?? source.prefix(set),
						mode: source.vendored?.() ? 'vendored' : 'iconify-api',
					}
				}),
			}
		},

		sources: async ({ context }) => {
			return sourceRows(runtimeContext(context).vendorRoot)
		},

		search: async ({ input, context }) => {
			const runtime = runtimeContext(context)
			const manifest = loadManifest(runtime.manifestPath)
			const used = manifest ? Object.keys(manifest) : []

			let results
			let scope: string[] | 'all' | null
			if (input.set && input.set !== '*') {
				// 显式单库:已 vendor 走本地(含 API 隐藏的 deprecated 图标),否则 API
				scope = [input.set]
				const local = sourceFor(input.set, runtime.vendorRoot)
				const source = local.vendored?.() ? local : iconifySource
				results = [
					await attempt(
						source.search(input.query, {
							set: input.set,
							limit: input.limit,
						}),
					),
				]
			} else if (input.set === '*' || used.length === 0) {
				// set: '*' 显式全局;冷项目(尚未 use 任何库)也退回全局发现
				scope = 'all'
				results = [
					await attempt(
						iconifySource.search(input.query, { limit: input.limit }),
					),
				]
			} else {
				// 默认作用域 = 已 use 的库:vendored 的并发本地搜,
				// 长尾(无专属 adapter)打包一次 iconify prefixes 查询
				scope = used
				const localSets = used.filter((s) =>
					sourceFor(s, runtime.vendorRoot).vendored?.(),
				)
				const apiSets = used.filter((s) => !localSets.includes(s))
				results = await attempt(
					Promise.all([
						...localSets.map((s) =>
							sourceFor(s, runtime.vendorRoot).search(input.query, {
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
			}

			const hits = results.flatMap((r) => r.hits)
			const total = results.reduce((n, r) => n + r.total, 0)
			const sets = Object.assign(
				{},
				...results.map((r) => r.sets),
			) as (typeof results)[number]['sets']

			return {
				icons: hits.map(formatRef),
				shown: hits.length,
				total,
				scope,
				sets,
			}
		},

		add: async ({ input, context }) => {
			const runtime = runtimeContext(context)
			let refs
			try {
				refs = input.refs.map(parseRef)
			} catch (e) {
				fail('invalid_ref', (e as Error).message)
			}
			if (input.as && refs.length !== 1) {
				fail('alias_requires_single_ref', 'as requires exactly one ref')
			}

			const manifest = loadManifest(runtime.manifestPath) ?? defaultManifest()
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
				// 像 pnpm add:先 vendor(sparse clone 进全局 cache)
				// 再按 effective 名(含 set.variant)校验存在性,manifest 里不留死引用
				const checkRefs = fresh.map((ref) =>
					effectiveRef(
						manifest,
						{ set: ref.set, name: ref.name },
						runtime.vendorRoot,
					),
				)
				const { missing } = await attempt(
					resolveRefs(checkRefs, runtime.vendorRoot),
				)
				if (missing.length > 0) {
					fail(
						'icon_not_found',
						`not found: ${missing.map(formatRef).join(', ')}\n` +
							`  try \`sigil search "{ query: '<query>' }"\` to find the right name`,
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
					prefixFor(manifest, runtime.vendorRoot),
				)
			} catch (e) {
				fail('component_collision', (e as Error).message)
			}
			if (fresh.length > 0) saveManifest(runtime.manifestPath, manifest)

			return {
				added: fresh.map((ref) => {
					const entry: FlatEntry = input.as
						? { set: ref.set, name: ref.name, as: input.as }
						: { set: ref.set, name: ref.name }
					return {
						ref: formatRef(ref),
						component: nameFor(manifest, entry, runtime.vendorRoot),
					}
				}),
				skipped,
				autoUsed,
			}
		},

		remove: async ({ input, context }) => {
			const runtime = runtimeContext(context)
			const manifest =
				loadManifest(runtime.manifestPath) ??
				fail('manifest_missing', 'no manifest found')
			// 裸 set 名(无 /)= 删除整个库声明;带 / 的是单个图标
			const bareSets = input.refs.filter((t) => !/\//.test(t))
			let refs
			try {
				refs = input.refs.filter((t) => /\//.test(t)).map(parseRef)
			} catch (e) {
				fail('invalid_ref', (e as Error).message)
			}
			let removed = 0
			const notFound: string[] = []
			const removedLibraries: string[] = []
			for (const set of bareSets) {
				if (manifest[set]) {
					removed += manifest[set].icons.length
					delete manifest[set]
					removedLibraries.push(set)
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
			saveManifest(runtime.manifestPath, manifest)
			return { removed, libraries: removedLibraries, notFound }
		},

		list: async ({ input, context }) => {
			const runtime = runtimeContext(context)
			const manifest = loadManifest(runtime.manifestPath)
			const used = manifest ? Object.keys(manifest) : []
			if (!manifest || used.length === 0) {
				return { libraries: [], icons: [] }
			}
			const libraries = used.map((set) => {
				const cssMode = cssModeFor(manifest, set, runtime.vendorRoot)
				return {
					set,
					...(manifest[set]?.variant ? { variant: manifest[set].variant } : {}),
					...(cssMode ? { cssMode } : {}),
					prefix:
						manifest[set]?.prefix ??
						sourceFor(set, runtime.vendorRoot).prefix(set),
				}
			})
			const entries = flatten(manifest)
			const rows = entries.map((entry) => {
				const eff = effectiveRef(manifest, entry, runtime.vendorRoot)
				return {
					id: `${entry.set}/${entry.name}`,
					resolved: formatRef(eff),
					...(entry.as ? { as: entry.as } : {}),
					component: nameFor(manifest, entry, runtime.vendorRoot),
				}
			})
			return { libraries, icons: rows }
		},

		etch: async ({ input, context }) => {
			const runtime = runtimeContext(context)
			const manifest = loadManifest(runtime.manifestPath)
			if (!manifest || flatten(manifest).length === 0) {
				fail('manifest_empty', 'manifest is empty — add icons first')
			}
			if (input.atlas && !input.jsx) {
				fail(
					'atlas_requires_component_renderer',
					'atlas requires jsx react, solid, octane, or tsrx',
				)
			}
			if (input.format && input.jsx) {
				fail('conflicting_renderers', 'format and jsx cannot be combined')
			}
			const named = await resolveManifest(manifest, runtime.vendorRoot)
			const renderer = renderers[input.format ?? input.jsx ?? 'svg']!

			if (renderer.defaultFile) {
				// CSS 与组件模块各自只认自己的文件后缀，避免把带点号的目录误判成文件。
				const outputIsFile = input.format
					? extname(input.output) === '.css'
					: /\.(tsrx|[cm]?[tj]sx?)$/.test(input.output)
				const out = outputIsFile
					? input.output
					: join(input.output, renderer.defaultFile)
				let files
				try {
					files = renderer.render(named, {
						atlas: input.atlas,
						atlasFileName: atlasFileNameFor(out),
						// Octane's tsrx-tsc resolves sibling .tsrx modules only
						// with the authored extension; other targets keep their
						// established extensionless imports.
						atlasImportPath:
							renderer.id === 'octane'
								? `./${basename(out)}`
								: importPathFor(out),
					})
				} catch (e) {
					fail('render_failed', (e as Error).message)
				}
				mkdirSync(dirname(out), { recursive: true })
				writeFileSync(out, files[0]!.content)
				const extraFiles = files.slice(1)
				for (const file of extraFiles) {
					writeFileSync(join(dirname(out), file.path), file.content)
				}
				return {
					icons: named.length,
					output: out,
					files: [
						out,
						...extraFiles.map((file) => join(dirname(out), file.path)),
					],
				}
			} else {
				const files = renderer.render(named)
				mkdirSync(input.output, { recursive: true })
				for (const file of files) {
					writeFileSync(join(input.output, file.path), file.content)
				}
				return {
					icons: files.length,
					output: input.output,
					files: files.map((file) => join(input.output, file.path)),
				}
			}
		},
	},
})
