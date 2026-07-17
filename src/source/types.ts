import type { IconRef } from '../ref.ts'

export type CssMode = 'mask' | 'image'

export type SearchResult = {
	hits: IconRef[]
	total: number
	/** Set → 展示信息,search 输出按 set 分组时使用 */
	sets: Record<string, { title: string; license?: string }>
}

export type ResolvedIcon = {
	ref: IconRef
	/**
	 * 归一化后的 <svg> 内部内容:alias/transform 已展开,ID 已唯一化。 各库的 fill/stroke 语义保留在 body
	 * 内,渲染层不做猜测。
	 */
	body: string
	viewBox: string
	license?: { title?: string; spdx?: string; url?: string }
}

export interface IconSource {
	readonly id: string
	/**
	 * Set → 组件名前缀(lucide → Lu → LuGithubLight)。 spec:必须以大写字母开头——这同时保证了 JSX 组件名合法,
	 * 且跨库重名(lucide/github vs simple-icons/github)天然不撞。
	 */
	prefix(set: string): string
	/**
	 * Safe CSS default; adapters with ambiguous color semantics require a
	 * manifest override.
	 */
	cssMode?(set: string): CssMode
	/**
	 * 该库"无后缀"的 variant 名(ph → regular,heroicons → outline)。 manifest 的
	 * set.variant 等于它时不拼后缀;无 variant 概念的库不声明。
	 */
	readonly defaultVariant?: string
	/**
	 * 把上游数据 vendor 到本地(node_modules/.icons/<set>),幂等:已存在即跳过。 `add`/`etch`
	 * 前置调用,后续命令全走本地。API 型 adapter 不实现。
	 */
	vendor?(): Promise<void>
	/** 本地数据是否就绪;search 据此决定走本地还是 fallback */
	vendored?(): boolean
	search(
		query: string,
		// set 单库过滤;sets 多库过滤(iconify fallback 用于"已 use 的长尾库"作用域搜索)
		opts?: { set?: string; sets?: string[]; limit?: number },
	): Promise<SearchResult>
	/** 批量解析;缺失不抛错而是报告,失败策略由调用方决定 */
	resolve(refs: IconRef[]): Promise<{
		icons: ResolvedIcon[]
		missing: IconRef[]
	}>
}
