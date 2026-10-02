import type { CssMode, ResolvedIcon } from '../source/types.ts'

export type NamedIcon = ResolvedIcon & {
	componentName: string
	/**
	 * 根 <svg> 的 presentation 属性(fill/stroke/stroke-width…),已从 body 提升,
	 * 子元素只靠继承——CSS 写在 <svg> 上才能覆盖线宽。见 svg-attrs.ts。
	 */
	attrs: Record<string, string>
	/** 逐文件输出时的文件名(无扩展名),已保证唯一 */
	fileName: string
	/**
	 * Resolved source default or manifest override; required only by the CSS
	 * renderer.
	 */
	cssMode?: CssMode
}

/** Path 相对于输出目录;模块型 renderer 返回单文件,CLI 可用 -o 覆盖其位置 */
export type RenderedFile = { path: string; content: string }

export type RenderOptions = {
	readonly atlas?: boolean
	readonly atlasFileName?: string
	readonly atlasImportPath?: string
}

export interface Renderer {
	readonly id: string
	/** 模块型 renderer 的默认文件名;null 表示逐图标输出 */
	readonly defaultFile: string | null
	render(icons: NamedIcon[], options?: RenderOptions): RenderedFile[]
}

/** 根属性 → ` fill="none" stroke-width="2"`;jsx 时转 React 风格的 camelCase */
export function rootAttrs(
	icon: NamedIcon,
	jsx = false,
	omit: readonly string[] = [],
): string {
	return Object.entries(icon.attrs)
		.filter(([name]) => !omit.includes(name))
		.map(([name, value]) => {
			const key = jsx
				? name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
				: name
			return ` ${key}="${value}"`
		})
		.join('')
}

export function licenseTag(icon: NamedIcon): string {
	const lic = icon.license?.spdx ?? icon.license?.title
	return lic ? ` · ${lic}` : ''
}
