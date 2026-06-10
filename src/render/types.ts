import type { ResolvedIcon } from '../source/types.ts'

export type NamedIcon = ResolvedIcon & {
	componentName: string
	/** 逐文件输出时的文件名(无扩展名),已保证唯一 */
	fileName: string
}

/** Path 相对于输出目录;模块型 renderer 返回单文件,CLI 可用 -o 覆盖其位置 */
export type RenderedFile = { path: string; content: string }

export interface Renderer {
	readonly id: string
	/** 模块型 renderer 的默认文件名;null 表示逐图标输出 */
	readonly defaultFile: string | null
	render(icons: NamedIcon[]): RenderedFile[]
}

export function licenseTag(icon: NamedIcon): string {
	const lic = icon.license?.spdx ?? icon.license?.title
	return lic ? ` · ${lic}` : ''
}
