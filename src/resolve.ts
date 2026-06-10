import type { IconRef } from './ref.ts'
import type { ResolvedIcon } from './source/types.ts'

import { formatRef } from './ref.ts'
import { sourceFor } from './source/registry.ts'

/**
 * 跨 adapter 批量解析:按 set 分组路由到各自 adapter, vendor(幂等)+ resolve
 * 全部并发;结果按输入序返回(codegen diff 稳定)。
 */
export async function resolveRefs(
	refs: IconRef[],
	vendorRoot: string,
): Promise<{ icons: ResolvedIcon[]; missing: IconRef[] }> {
	const groups = new Map<string, IconRef[]>()
	for (const ref of refs) {
		const group = groups.get(ref.set) ?? []
		group.push(ref)
		groups.set(ref.set, group)
	}

	const results = await Promise.all(
		[...groups.entries()].map(async ([set, group]) => {
			const source = sourceFor(set, vendorRoot)
			await source.vendor?.()
			return source.resolve(group)
		}),
	)

	const icons = results.flatMap((r) => r.icons)
	const missing = results.flatMap((r) => r.missing)
	const order = new Map(refs.map((ref, i) => [formatRef(ref), i]))
	icons.sort(
		(a, b) =>
			(order.get(formatRef(a.ref)) ?? 0) - (order.get(formatRef(b.ref)) ?? 0),
	)
	return { icons, missing }
}
