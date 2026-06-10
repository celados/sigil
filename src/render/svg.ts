import { iconToHTML } from '@iconify/utils'

import type { Renderer } from './types.ts'

import { formatRef } from '../ref.ts'
import { licenseTag } from './types.ts'

export const svgRenderer: Renderer = {
	id: 'svg',
	defaultFile: null,
	render(icons) {
		return icons.map((icon) => {
			// 静态资产带显式像素尺寸(取自 viewBox),比 1em 对工具链更友好
			const [, , w, h] = icon.viewBox.split(' ')
			const svg = iconToHTML(icon.body, {
				viewBox: icon.viewBox,
				width: w!,
				height: h!,
			})
			return {
				path: `${icon.fileName}.svg`,
				content: `<!-- ${formatRef(icon.ref)}${licenseTag(icon)} -->\n${svg}\n`,
			}
		})
	},
}
