import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { IconSource, ResolvedIcon } from './types.ts'

import { normalizeSvg } from './lucide.ts'
import { sparseClone } from './vendor.ts'

const REPO = 'https://github.com/tabler/tabler-icons.git'

const LICENSE = {
	title: 'MIT',
	spdx: 'MIT',
	url: 'https://github.com/tabler/tabler-icons/blob/main/LICENSE',
}

/**
 * SVG 文件头注释里提取 tags 数组。 tabler 上游在每个 outline SVG 的注释块里内联了 tags: [...], filled
 * 文件没有 tags——设计如此，filled 是 outline 的配套变体。
 */
function extractTags(svg: string): string[] {
	// 匹配注释块中形如 `tags: [foo, bar, baz]` 的一行
	const m = svg.match(/tags:\s*\[([^\]]*)\]/)
	if (!m) return []
	return m[1]!
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean)
}

export function createTablerSource(dir: string): IconSource {
	const outlineDir = join(dir, 'icons', 'outline')
	const filledDir = join(dir, 'icons', 'filled')

	return {
		id: 'tabler',
		// Iconify fallback 推导规则:单词取头两字母 → `Ta`
		prefix: () => 'Ta',
		cssMode: () => 'mask',
		// outline 是无后缀 variant;filled 子集较小,缺失走 missing 报错
		defaultVariant: 'outline',
		vendored: () => existsSync(outlineDir),

		async vendor() {
			if (existsSync(outlineDir)) return
			await sparseClone(REPO, dir, ['icons'])
		},

		async search(query, opts) {
			const q = query.toLowerCase()
			const limit = opts?.limit ?? 64

			// outline 文件名就是 Iconify name(无后缀)
			const outlineFiles = (await readdir(outlineDir)).filter((f) =>
				f.endsWith('.svg'),
			)
			// filled 文件名对应 Iconify name 需追加 -filled 后缀
			const filledFiles = (await readdir(filledDir)).filter((f) =>
				f.endsWith('.svg'),
			)

			// 先做名字匹配
			const matchedOutline = outlineFiles
				.map((f) => f.slice(0, -4))
				.filter((n) => n.includes(q))
			const matchedFilled = filledFiles
				.map((f) => f.slice(0, -4))
				// filled 的 Iconify name = `<base>-filled`;查询时也要匹配带后缀的形式
				.filter((n) => n.includes(q) || `${n}-filled`.includes(q))

			// 名字未命中的 outline 图标再查 SVG 内联 tags(只有 outline 有 tags)
			const unmatchedOutline = outlineFiles
				.map((f) => f.slice(0, -4))
				.filter((n) => !n.includes(q))
			const byTag = (
				await Promise.all(
					unmatchedOutline.map(async (n) => {
						try {
							const svg = await readFile(join(outlineDir, `${n}.svg`), 'utf-8')
							const tags = extractTags(svg)
							return tags.some((t) => t.toLowerCase().includes(q)) ? n : null
						} catch {
							return null
						}
					}),
				)
			).filter((n): n is string => n !== null)

			// 拼装：outline 名直接用，filled 名追加 -filled
			const outlineHits = [...matchedOutline, ...byTag].map((name) => ({
				set: 'tabler',
				name,
			}))
			const filledHits = matchedFilled.map((base) => ({
				set: 'tabler',
				name: `${base}-filled`,
			}))

			const all = [...outlineHits, ...filledHits]
			return {
				hits: all.slice(0, limit),
				total: all.length,
				sets: { tabler: { title: 'Tabler Icons', license: LICENSE.spdx } },
			}
		},

		async resolve(refs) {
			const icons: ResolvedIcon[] = []
			const missing: typeof refs = []

			await Promise.all(
				refs.map(async (ref) => {
					// Iconify 命名规则:name 以 -filled 结尾 → 走 filled 目录,否则走 outline
					const isFilled = ref.name.endsWith('-filled')
					const base = isFilled
						? ref.name.slice(0, -'-filled'.length)
						: ref.name
					const svgPath = isFilled
						? join(filledDir, `${base}.svg`)
						: join(outlineDir, `${ref.name}.svg`)

					let svg: string
					try {
						svg = await readFile(svgPath, 'utf-8')
					} catch {
						missing.push(ref)
						return
					}

					const normalized = normalizeSvg(svg)
					if (!normalized) {
						missing.push(ref)
						return
					}
					icons.push({ ref, ...normalized, license: LICENSE })
				}),
			)

			return { icons, missing }
		},
	}
}
