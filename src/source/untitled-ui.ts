import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { IconSource, ResolvedIcon } from './types.ts'

import { normalizeSvg } from './lucide.ts'
import { isFresh, sparseClone } from './vendor.ts'

const REPO = 'https://github.com/untitleduico/icons.git'

/**
 * 免费集不是开源许可:npm 元数据写 MIT,但仓库 LICENSE 正文允许商业项目使用、禁止再分发 与衍生图标库。sigil
 * 只在使用者本机拉取,生成物嵌入使用者自己的应用;发布到 npm 的组件库 / UI kit 不能带这些图标。license
 * 注释原样带到生成物里提醒这一点。
 */
const LICENSE = {
	title: 'Untitled UI License (no redistribution)',
	url: 'https://github.com/untitleduico/icons/blob/main/LICENSE',
}

export function createUntitledUiSource(dir: string): IconSource {
	const iconsDir = join(dir, 'icons')

	return {
		id: 'untitled-ui',
		cssMode: () => 'mask',
		vendored: () => existsSync(iconsDir),

		async vendor() {
			if (isFresh(dir)) return
			await sparseClone(REPO, dir, ['icons'])
		},

		async search(query, opts) {
			const q = query.toLowerCase()
			const hits = (await readdir(iconsDir))
				.filter((f) => f.endsWith('.svg'))
				.map((f) => f.slice(0, -4))
				.filter((n) => n.includes(q))
				.sort()
			const limit = opts?.limit ?? 64
			return {
				hits: hits
					.slice(0, limit)
					.map((name) => ({ set: 'untitled-ui', name })),
				total: hits.length,
				sets: {
					'untitled-ui': { title: 'Untitled UI', license: LICENSE.title },
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
