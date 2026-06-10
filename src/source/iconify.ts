import type { IconifyInfo, IconifyJSON } from '@iconify/types'

import { getIconData, iconToSVG, replaceIDs } from '@iconify/utils'

import type { IconRef } from '../ref.ts'
import type { IconSource, ResolvedIcon } from './types.ts'

import { formatRef } from '../ref.ts'

const API = 'https://api.iconify.design'

type SearchResponse = {
	icons: string[]
	total: number
	collections: Record<string, IconifyInfo>
}

class ApiError extends Error {
	constructor(
		readonly status: number,
		url: URL | string,
	) {
		super(`iconify API ${status} for ${url}`)
	}
}

async function getJson(url: URL | string): Promise<unknown> {
	const res = await fetch(url)
	if (!res.ok) {
		throw new ApiError(res.status, url)
	}
	return res.json()
}

/** Set 级 license 用于产物的 attribution 头;拿不到不阻塞主流程 */
async function fetchSetInfo(
	sets: string[],
): Promise<Record<string, IconifyInfo>> {
	try {
		const url = new URL(`${API}/collections`)
		url.searchParams.set('prefixes', sets.join(','))
		const data = (await getJson(url)) as Record<string, IconifyInfo>
		return data
	} catch {
		return {}
	}
}

/**
 * React-icons 风格的短前缀:单词取头两个字母(lucide → Lu), 多段取各段首字母(simple-icons → Si,
 * icon-park-outline → Ipo)。 多段取全部首字母而非前两段,避免 icon-park-{outline,solid} 同前缀。
 */
export function derivePrefix(set: string): string {
	const parts = set.split('-')
	const raw =
		parts.length > 1 ? parts.map((p) => p.charAt(0)).join('') : set.slice(0, 2)
	return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

export const iconifySource: IconSource = {
	id: 'iconify',
	prefix: derivePrefix,

	async search(query, opts) {
		const url = new URL(`${API}/search`)
		url.searchParams.set('query', query)
		if (opts?.set) url.searchParams.set('prefix', opts.set)
		if (opts?.sets?.length)
			url.searchParams.set('prefixes', opts.sets.join(','))
		if (opts?.limit) url.searchParams.set('limit', String(opts.limit))
		const data = (await getJson(url)) as SearchResponse

		const hits: IconRef[] = data.icons.flatMap((id) => {
			const colon = id.indexOf(':')
			if (colon === -1) return []
			return [{ set: id.slice(0, colon), name: id.slice(colon + 1) }]
		})
		const sets: Record<string, { title: string; license?: string }> = {}
		for (const [prefix, info] of Object.entries(data.collections ?? {})) {
			sets[prefix] = {
				title: info.name,
				...(info.license?.spdx || info.license?.title
					? { license: info.license.spdx ?? info.license.title }
					: {}),
			}
		}
		return { hits, total: data.total, sets }
	},

	async resolve(refs) {
		const bySets = new Map<string, IconRef[]>()
		for (const ref of refs) {
			const group = bySets.get(ref.set) ?? []
			group.push(ref)
			bySets.set(ref.set, group)
		}

		const infos = await fetchSetInfo([...bySets.keys()])
		const icons: ResolvedIcon[] = []
		const missing: IconRef[] = []

		await Promise.all(
			[...bySets.entries()].map(async ([set, group]) => {
				let data: IconifyJSON
				try {
					const url = new URL(`${API}/${set}.json`)
					url.searchParams.set('icons', group.map((r) => r.name).join(','))
					data = (await getJson(url)) as IconifyJSON
				} catch (e) {
					// 只有 404(set 不存在)算缺失;瞬时网络错误必须如实抛出,
					// 误报 not found 会诱导用户删掉好图标
					if (e instanceof ApiError && e.status === 404) {
						missing.push(...group)
						return
					}
					throw e
				}
				for (const ref of group) {
					const icon = getIconData(data, ref.name)
					if (!icon) {
						missing.push(ref)
						continue
					}
					const built = iconToSVG(icon)
					const license = infos[set]?.license
					icons.push({
						ref,
						body: replaceIDs(built.body),
						viewBox: built.attributes.viewBox,
						...(license ? { license } : {}),
					})
				}
			}),
		)

		// 调用方依赖稳定顺序(codegen diff 友好),按输入序排
		const order = new Map(refs.map((r, i) => [formatRef(r), i]))
		icons.sort(
			(a, b) =>
				(order.get(formatRef(a.ref)) ?? 0) - (order.get(formatRef(b.ref)) ?? 0),
		)
		return { icons, missing }
	},
}
