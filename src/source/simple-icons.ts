import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { IconSource, ResolvedIcon } from './types.ts'

import { normalizeSvg } from './lucide.ts'
import { sparseClone } from './vendor.ts'

const REPO = 'https://github.com/simple-icons/simple-icons.git'

// CC0-1.0：simple-icons 明确放弃版权，品牌本身由各公司持有
const LICENSE = {
	title: 'CC0-1.0',
	spdx: 'CC0-1.0',
	url: 'https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md',
}

/**
 * Simple-icons 上游 SVG 的特殊处理：
 *
 * 1. 剥掉 <title>...</title>（无障碍标题，Iconify body 不含）
 * 2. 在根 SVG 上注入 fill="currentColor"——上游 path 不带 fill 属性， 若不注入，normalizeSvg 产出的
 *    body 也无 fill，渲染时图标不可见。 Iconify 的等效做法是直接在 path 上写 fill="currentColor"； 我们用
 *    <g fill="currentColor"> 包裹，语义等价，由 convertParsedSVG 保证。
 */
function stripAndNormalize(svg: string): ReturnType<typeof normalizeSvg> {
	const stripped = svg.replace(/<title>[^<]*<\/title>/g, '')
	const withFill = stripped.replace(/(<svg\b[^>]*)>/, '$1 fill="currentColor">')
	return normalizeSvg(withFill)
}

export function createSimpleIconsSource(dir: string): IconSource {
	const iconsDir = join(dir, 'icons')

	return {
		id: 'simple-icons',
		// Iconify fallback 推导规则：多段取各段首字母 → `Si`
		prefix: () => 'Si',
		vendored: () => existsSync(iconsDir),

		async vendor() {
			if (existsSync(iconsDir)) return
			await sparseClone(REPO, dir, ['icons'])
		},

		async search(query, opts) {
			const names = (await readdir(iconsDir))
				.filter((f) => f.endsWith('.svg'))
				.map((f) => f.slice(0, -4))

			// slug 本身即品牌名小写化（如 githubactions、dotnet），直接子串匹配已覆盖大多数查询
			const q = query.toLowerCase()
			const hits = names.filter((n) => n.includes(q))
			const limit = opts?.limit ?? 64

			return {
				hits: hits
					.slice(0, limit)
					.map((name) => ({ set: 'simple-icons', name })),
				total: hits.length,
				sets: {
					'simple-icons': { title: 'Simple Icons', license: LICENSE.spdx },
				},
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

					const normalized = stripAndNormalize(svg)
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
