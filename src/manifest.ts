import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { CssMode } from './source/types.ts'

import { parseRef, pascalCase } from './ref.ts'

export type IconEntry = string | { name: string; as: string }

export type SetConfig = {
	/** Set 级 variant(duotone / 20-solid / filled…);不填 = adapter 默认 */
	variant?: string
	/** 覆盖 adapter 的组件名前缀;不填 = adapter 提供 */
	prefix?: string
	/**
	 * Overrides the source default when CSS color semantics cannot be inferred
	 * safely.
	 */
	cssMode?: CssMode
	icons: IconEntry[]
}

/** Manifest 顶层即 set → 配置的 map:variant/prefix 是 set 级设计决策,挂在这里 */
export type Manifest = Record<string, SetConfig>

/** 展开后的内部形态;name 是 base 名,不含 set.variant 后缀 */
export type FlatEntry = { set: string; name: string; as?: string }

export function defaultManifest(): Manifest {
	return {}
}

export function loadManifest(path: string): Manifest | null {
	if (!existsSync(path)) return null
	const raw = JSON.parse(readFileSync(path, 'utf-8')) as Manifest
	// 早失败:manifest 可手编辑,坏 set/name 在 load 时就报出来
	for (const [set, config] of Object.entries(raw)) {
		if (config.cssMode && !['mask', 'image'].includes(config.cssMode)) {
			throw new Error(
				`invalid cssMode "${config.cssMode}" for set "${set}" — expected "mask" or "image"`,
			)
		}
		for (const entry of config.icons ?? []) {
			parseRef(`${set}/${typeof entry === 'string' ? entry : entry.name}`)
		}
	}
	return raw
}

export function saveManifest(path: string, manifest: Manifest): void {
	const sorted: Manifest = {}
	for (const set of Object.keys(manifest).sort()) {
		const config = manifest[set]!
		// 空 icons 的 set 保留:它是 `use` 声明的"项目使用这个库"标记
		sorted[set] = {
			...(config.variant ? { variant: config.variant } : {}),
			...(config.prefix ? { prefix: config.prefix } : {}),
			...(config.cssMode ? { cssMode: config.cssMode } : {}),
			icons: [...config.icons].sort((a, b) =>
				entryName(a).localeCompare(entryName(b)),
			),
		}
	}
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, JSON.stringify(sorted, null, '\t') + '\n')
}

export function entryName(entry: IconEntry): string {
	return typeof entry === 'string' ? entry : entry.name
}

export function flatten(manifest: Manifest): FlatEntry[] {
	return Object.entries(manifest).flatMap(([set, config]) =>
		config.icons.map((entry) =>
			typeof entry === 'string'
				? { set, name: entry }
				: { set, name: entry.name, as: entry.as },
		),
	)
}

/**
 * Base 名 + set 级 variant → 上游实际图标名。 规则全库统一(镜像 Iconify 约定):默认 variant 无后缀,其余
 * `-{variant}`。 adapter 只需声明 defaultVariant 字符串,无需泛化接口。
 */
export function effectiveName(
	name: string,
	variant: string | undefined,
	defaultVariant: string | undefined,
): string {
	if (!variant || variant === defaultVariant) return name
	return `${name}-${variant}`
}

/**
 * 组件名 = (set.prefix 覆盖 ?? adapter 前缀) + (as | PascalCase(base 名))。 用 base 名而非
 * effective 名:切换 set.variant 不改任何组件名/import。 前缀 spec:首字母大写——保证 JSX
 * 组件名合法,跨库重名天然不撞。
 */
export function componentName(entry: FlatEntry, prefix: string): string {
	if (!/^[A-Z]/.test(prefix)) {
		throw new Error(
			`prefix "${prefix}" for set "${entry.set}" must start with an uppercase letter`,
		)
	}
	const full = prefix + (entry.as ?? pascalCase(entry.name))
	if (!/^[A-Za-z_$][\w$]*$/.test(full)) {
		throw new Error(
			`"${entry.set}/${entry.name}" derives invalid identifier "${full}" — set "as" to override`,
		)
	}
	return full
}

/** 撞名直接报错,绝不静默覆盖 */
export function assertNoCollisions(
	entries: FlatEntry[],
	prefixFor: (set: string) => string,
): void {
	const seen = new Map<string, string>()
	for (const entry of entries) {
		const name = componentName(entry, prefixFor(entry.set))
		const id = `${entry.set}/${entry.name}`
		const prev = seen.get(name)
		if (prev) {
			throw new Error(
				`name collision: "${prev}" and "${id}" both produce ${name} — disambiguate with { "name": "...", "as": "..." }`,
			)
		}
		seen.set(name, id)
	}
}
