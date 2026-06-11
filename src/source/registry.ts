import { join } from 'node:path'

import type { IconSource } from './types.ts'

import { createHeroiconsSource } from './heroicons.ts'
import { iconifySource } from './iconify.ts'
import { createLucideSource } from './lucide.ts'
import { createPhSource } from './ph.ts'
import { createSimpleIconsSource } from './simple-icons.ts'
import { createSvglSource } from './svgl.ts'
import { createTablerSource } from './tabler.ts'

/**
 * Set → 专属 adapter 工厂。专属 adapter 在 add 时把上游 vendor 到
 * node_modules/.icons/<set>,后续命令全走本地;未注册的 set 走 iconify API fallback(覆盖 200+
 * 库,保住广泛搜索)。
 */
const factories: Record<string, (dir: string) => IconSource> = {
	heroicons: createHeroiconsSource,
	lucide: createLucideSource,
	ph: createPhSource,
	'simple-icons': createSimpleIconsSource,
	svgl: createSvglSource,
	tabler: createTablerSource,
}

export const bundledSourceSets = Object.keys(factories).sort()

export function sourceFor(set: string, vendorRoot: string): IconSource {
	const factory = factories[set]
	return factory ? factory(join(vendorRoot, set)) : iconifySource
}
