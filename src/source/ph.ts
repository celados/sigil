import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { IconSource, ResolvedIcon } from './types.ts'

import { normalizeSvg } from './lucide.ts'
import { isFresh, sparseClone } from './vendor.ts'

const REPO = 'https://github.com/phosphor-icons/core.git'

const LICENSE = {
	title: 'MIT',
	spdx: 'MIT',
	url: 'https://github.com/phosphor-icons/core/blob/main/LICENSE',
}

// 6 个 weight 与上游目录的映射。
// regular 是"无后缀"变体:上游文件名 = <name>.svg,其余均为 <name>-<weight>.svg。
// Iconify 命名:regular → `house`(无 weight 后缀);其余 → `house-bold` / `house-duotone` 等。
const WEIGHTS = ['bold', 'duotone', 'fill', 'light', 'regular', 'thin'] as const
type Weight = (typeof WEIGHTS)[number]

/**
 * Iconify name → (weight 目录, 文件路径)。 规则:name 以已知 weight 后缀结尾则拆分,否则视为 regular。
 * 示例: "house" → { weight: "regular", file: "house.svg" } "house-bold" → {
 * weight: "bold", file: "house-bold.svg" } "house-duotone" → { weight:
 * "duotone", file: "house-duotone.svg" }
 */
function iconifyNameToPath(
	assetsDir: string,
	iconifyName: string,
): { weight: Weight; svgPath: string } {
	for (const w of WEIGHTS) {
		if (w === 'regular') continue // 最后兜底
		if (iconifyName.endsWith(`-${w}`)) {
			return {
				weight: w,
				svgPath: join(assetsDir, w, `${iconifyName}.svg`),
			}
		}
	}
	// 无 weight 后缀 → regular,文件名就是 iconifyName(无后缀追加)
	return {
		weight: 'regular',
		svgPath: join(assetsDir, 'regular', `${iconifyName}.svg`),
	}
}

export function createPhSource(dir: string): IconSource {
	const assetsDir = join(dir, 'assets')

	return {
		id: 'ph',
		// Iconify 推导规则:单段名 `ph` → 取前两字母 → `Ph`
		prefix: () => 'Ph',
		cssMode: () => 'mask',
		// regular 是无后缀 variant:manifest 的 set.variant 据此决定是否拼后缀
		defaultVariant: 'regular',
		vendored: () => existsSync(assetsDir),

		async vendor() {
			if (isFresh(dir)) return
			await sparseClone(REPO, dir, ['assets'])
		},

		async search(query, opts) {
			const q = query.toLowerCase()
			const limit = opts?.limit ?? 64

			// regular 目录文件名就是 Iconify base name(无 weight 后缀)
			const regularFiles = (await readdir(join(assetsDir, 'regular'))).filter(
				(f) => f.endsWith('.svg'),
			)
			// 只列 base 名:weight 是 set 级配置(manifest 的 variant),
			// 同图形展开 6 个变体只会刷屏、把别的命中挤出 limit
			const hits = regularFiles
				.map((f) => f.slice(0, -4)) // strip .svg → base name
				.filter((n) => n.includes(q))
				.map((name) => ({ set: 'ph', name }))

			return {
				hits: hits.slice(0, limit),
				total: hits.length,
				sets: { ph: { title: 'Phosphor Icons', license: LICENSE.spdx } },
			}
		},

		async resolve(refs) {
			const icons: ResolvedIcon[] = []
			const missing: typeof refs = []

			await Promise.all(
				refs.map(async (ref) => {
					const { svgPath } = iconifyNameToPath(assetsDir, ref.name)

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
