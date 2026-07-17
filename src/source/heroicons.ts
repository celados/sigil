import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { IconSource, ResolvedIcon } from './types.ts'

import { normalizeSvg } from './lucide.ts'
import { sparseClone } from './vendor.ts'

const REPO = 'https://github.com/tailwindlabs/heroicons.git'

const LICENSE = {
	title: 'MIT',
	spdx: 'MIT',
	url: 'https://github.com/tailwindlabs/heroicons/blob/main/LICENSE',
}

/**
 * 上游布局 → Iconify 命名的四条规则(已对照 api.iconify.design/heroicons.json 验证):
 * optimized/24/outline/<name>.svg → <name> (无后缀,默认 outline)
 * optimized/24/solid/<name>.svg → <name>-solid optimized/20/solid/<name>.svg →
 * <name>-20-solid optimized/16/solid/<name>.svg → <name>-16-solid
 *
 * 反向解析时按后缀从长到短匹配,避免 "foo-16-solid" 被误截为 "foo-16"。
 */
type Variant = {
	suffix: string // Iconify name 的后缀(空字符串表示 24 outline)
	subDir: string // optimized/ 下的相对路径
	viewBox: string // 对应 viewBox(便于 test assert)
}

const VARIANTS: Variant[] = [
	{ suffix: '-16-solid', subDir: '16/solid', viewBox: '0 0 16 16' },
	{ suffix: '-20-solid', subDir: '20/solid', viewBox: '0 0 20 20' },
	{ suffix: '-solid', subDir: '24/solid', viewBox: '0 0 24 24' },
	{ suffix: '', subDir: '24/outline', viewBox: '0 0 24 24' },
]

/** Iconify name → 上游文件路径 */
function resolveFilePath(
	optimizedDir: string,
	iconifyName: string,
): string | null {
	// 按后缀长度从长到短匹配,防止 "-solid" 抢先截断 "-16-solid"
	for (const v of VARIANTS) {
		if (v.suffix === '' || iconifyName.endsWith(v.suffix)) {
			const base = v.suffix
				? iconifyName.slice(0, -v.suffix.length)
				: iconifyName
			if (!base) continue
			return join(optimizedDir, v.subDir, `${base}.svg`)
		}
	}
	return null
}

export function createHeroiconsSource(dir: string): IconSource {
	// vendor 完成后的根目录:dir/optimized/{16,20,24}/...
	const optimizedDir = join(dir, 'optimized')
	const outlineDir = join(optimizedDir, '24/outline')

	return {
		id: 'heroicons',
		// Iconify fallback 推导规则:单词取头两字母 → "He"
		prefix: () => 'He',
		cssMode: () => 'mask',
		// 24px outline 是无后缀 variant;其余 variant:solid / 20-solid / 16-solid
		defaultVariant: 'outline',
		vendored: () => existsSync(outlineDir),

		async vendor() {
			if (existsSync(outlineDir)) return
			await sparseClone(REPO, dir, ['optimized'])
		},

		async search(query, opts) {
			const q = query.toLowerCase()
			const limit = opts?.limit ?? 64

			// 只列 base 名:variant(solid/20-solid/16-solid)是 set 级配置,
			// 同图形展开 4 个变体只会刷屏。heroicons 无 tags 元数据,仅文件名匹配
			const hits = (await readdir(outlineDir))
				.filter((f) => f.endsWith('.svg'))
				.map((f) => f.slice(0, -4))
				.filter((n) => n.includes(q))
				.map((name) => ({ set: 'heroicons', name }))

			return {
				hits: hits.slice(0, limit),
				total: hits.length,
				sets: { heroicons: { title: 'Heroicons', license: LICENSE.spdx } },
			}
		},

		async resolve(refs) {
			const icons: ResolvedIcon[] = []
			const missing: typeof refs = []

			await Promise.all(
				refs.map(async (ref) => {
					const filePath = resolveFilePath(optimizedDir, ref.name)
					if (!filePath) {
						missing.push(ref)
						return
					}

					let svg: string
					try {
						svg = await readFile(filePath, 'utf-8')
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
