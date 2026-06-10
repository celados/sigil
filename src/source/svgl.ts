import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { IconSource, ResolvedIcon } from './types.ts'

import { normalizeSvg } from './lucide.ts'
import { sparseClone } from './vendor.ts'

const REPO = 'https://github.com/pheralb/svgl.git'

// svgl 项目本身 MIT;但每个 logo 版权归各品牌所有——
// README 明确要求提交者确认有权使用且许可证允许入库。
// 因此这里记录的是 svgl 项目自身的许可证,
// 而非各品牌 logo 的许可证(那取决于各自品牌的政策)。
const LICENSE = {
	title: 'MIT (svgl project); individual logos © respective brands',
	spdx: 'MIT',
	url: 'https://github.com/pheralb/svgl/blob/main/LICENSE',
}

/**
 * 上游文件名 → sigil 合法 ref 名的规范化。
 *
 * 上游使用两种变体分隔符(_dark/_light 和 -dark/-light),且部分文件名含:
 *
 * - 下划线(_): affinity_designer, github_dark, aws_light 等(约 219/1078 个)
 * - 大写字母: Beacon-Logo, D3, FlowLauncher, googleMaps 等(8 个)
 *
 * 规则:全小写 + 下划线替换为连字符。 这保证输出符合 sigil ref 模式 [a-z0-9]+(?:-[a-z0-9]+)*。
 */
function fileNameToRef(fileName: string): string {
	return fileName.toLowerCase().replace(/_/g, '-')
}

/**
 * Sigil ref 名 → 上游实际文件名的逆向查找。
 *
 * 由于 _ → - 的映射是多对一(如 sigil 名 'github-dark' 可能对应上游 'github_dark' 或
 * 'github-dark'),resolve 时需要通过预建索引来查。 使用 Map<sigilRef → upstreamFileName>
 * 避免每次都遍历目录。
 */
async function buildRefIndex(libraryDir: string): Promise<Map<string, string>> {
	const files = (await readdir(libraryDir)).filter((f) => f.endsWith('.svg'))
	const index = new Map<string, string>()
	for (const f of files) {
		const baseName = f.slice(0, -4) // strip .svg
		const sigilRef = fileNameToRef(baseName)
		// 下面的逻辑确保第一个匹配优先,实测无冲突(见调研)
		if (!index.has(sigilRef)) {
			index.set(sigilRef, f)
		}
	}
	return index
}

export function createSvglSource(dir: string): IconSource {
	const libraryDir = join(dir, 'static', 'library')

	// 惰性缓存 refIndex,避免重复 readdir;同一进程 vendor 后只建一次。
	let _refIndex: Map<string, string> | null = null

	async function getRefIndex(): Promise<Map<string, string>> {
		if (!_refIndex) {
			_refIndex = await buildRefIndex(libraryDir)
		}
		return _refIndex
	}

	return {
		id: 'svgl',
		// svgl 只有 brand logo,无 weight/variant 概念
		// defaultVariant 不声明 — 传入 resolve 的 name 直接就是文件的 sigil ref 名
		prefix: () => 'Sv',

		vendored: () => existsSync(libraryDir),

		async vendor() {
			if (existsSync(libraryDir)) return
			// 只需要 static/library 目录,blobless sparse clone 秒级完成
			await sparseClone(REPO, dir, ['static/library'])
			// vendor 后重置缓存
			_refIndex = null
		},

		async search(query, opts) {
			const index = await getRefIndex()
			const q = query.toLowerCase()
			const limit = opts?.limit ?? 64

			// 只列 base 名(不含 dark/light 后缀的条目也是有效条目);
			// 不专门过滤 dark/light 变体 — svgl 的 dark/light 是独立的 logo 文件
			// (不是同一 logo 的主题切换),agent/用户都需要能搜到它们
			const hits = [...index.keys()]
				.filter((ref) => ref.includes(q))
				.map((name) => ({ set: 'svgl', name }))

			return {
				hits: hits.slice(0, limit),
				total: hits.length,
				sets: { svgl: { title: 'SVGL', license: LICENSE.spdx } },
			}
		},

		async resolve(refs) {
			const index = await getRefIndex()
			const icons: ResolvedIcon[] = []
			const missing: typeof refs = []

			await Promise.all(
				refs.map(async (ref) => {
					const upstreamFile = index.get(ref.name)
					if (!upstreamFile) {
						missing.push(ref)
						return
					}

					let svg: string
					try {
						svg = await readFile(join(libraryDir, upstreamFile), 'utf-8')
					} catch {
						missing.push(ref)
						return
					}

					// svgl 是彩色 brand logo:normalizeSvg 只做 viewBox/body 归一化 +
					// replaceIDs(防多 logo 同文档时 <defs> ID 碰撞),不注入 currentColor,
					// 不 strip 任何颜色属性
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
