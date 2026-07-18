import {
	convertParsedSVG,
	iconToSVG,
	parseSVGContent,
	replaceIDs,
} from '@iconify/utils'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { IconSource, ResolvedIcon } from './types.ts'

import { isFresh, sparseClone } from './vendor.ts'

const REPO = 'https://github.com/lucide-icons/lucide.git'

const LICENSE = {
	title: 'ISC',
	spdx: 'ISC',
	url: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE',
}

/**
 * 上游 SVG → 归一化 ResolvedIcon body/viewBox。 parseSVGContent/convertParsedSVG
 * 会把根上的 fill/stroke 语义收进 <g> 包裹, 描边型图标(lucide 全部是)的语义因此保留。导出供测试。
 */
export function normalizeSvg(
	svg: string,
): { body: string; viewBox: string } | null {
	const parsed = parseSVGContent(svg)
	if (!parsed) return null
	const icon = convertParsedSVG(parsed)
	if (!icon) return null
	const built = iconToSVG(icon)
	return { body: replaceIDs(built.body), viewBox: built.attributes.viewBox }
}

/** Lucide 元数据文件:icons/<name>.json,tags/categories 用于本地搜索 */
type LucideMeta = { tags?: string[]; categories?: string[] }

export function createLucideSource(dir: string): IconSource {
	const iconsDir = join(dir, 'icons')

	return {
		id: 'lucide',
		prefix: () => 'Lu',
		cssMode: () => 'mask',
		vendored: () => existsSync(iconsDir),

		async vendor() {
			if (isFresh(dir)) return
			await sparseClone(REPO, dir, ['icons'])
		},

		async search(query, opts) {
			const names = (await readdir(iconsDir))
				.filter((f) => f.endsWith('.svg'))
				.map((f) => f.slice(0, -4))
			const q = query.toLowerCase()
			const byName = names.filter((n) => n.includes(q))
			// 名字没命中的再查 tags(本地元数据,API 搜不到的 deprecated 图标这里也能搜到)
			const rest = names.filter((n) => !n.includes(q))
			const byTag = (
				await Promise.all(
					rest.map(async (n) => {
						try {
							const meta = JSON.parse(
								await readFile(join(iconsDir, `${n}.json`), 'utf-8'),
							) as LucideMeta
							const tags = [...(meta.tags ?? []), ...(meta.categories ?? [])]
							return tags.some((t) => t.toLowerCase().includes(q)) ? n : null
						} catch {
							return null
						}
					}),
				)
			).filter((n): n is string => n !== null)

			const all = [...byName, ...byTag]
			const limit = opts?.limit ?? 64
			return {
				hits: all.slice(0, limit).map((name) => ({ set: 'lucide', name })),
				total: all.length,
				sets: { lucide: { title: 'Lucide', license: LICENSE.spdx } },
			}
		},

		async resolve(refs) {
			const icons: ResolvedIcon[] = []
			const missing: typeof refs = []
			await Promise.all(
				refs.map(async (ref) => {
					let svg: string
					try {
						svg = await readFile(join(iconsDir, `${ref.name}.svg`), 'utf-8')
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
