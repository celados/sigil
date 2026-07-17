import type { NamedIcon, Renderer } from './types.ts'

import { formatRef } from '../ref.ts'
import { licenseTag } from './types.ts'

const BASE_RULE = `.sigil {
	display: inline-block;
	width: 1em;
	height: 1em;
	flex: none;
	vertical-align: -0.125em;
}`

function dataUrlFor(icon: NamedIcon): string {
	// Some upstream icon bodies still reference gradients through xlink. A standalone
	// data URL must declare that namespace because it cannot inherit one from the page.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${icon.viewBox}">${icon.body}</svg>`
	return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function ruleFor(icon: NamedIcon): string {
	if (!icon.cssMode) {
		throw new Error(
			`CSS mode is unknown for "${icon.ref.set}" — set "cssMode" to "mask" or "image" in icons.json`,
		)
	}

	const selector = `.sigil-${icon.fileName}`
	const url = `url("${dataUrlFor(icon)}")`
	const declaration =
		icon.cssMode === 'mask'
			? `	background-color: currentColor;
	mask: ${url} center / contain no-repeat;
	mask-mode: alpha;`
			: `	background: ${url} center / contain no-repeat;`

	return `/* ${formatRef(icon.ref)}${licenseTag(icon)} */
${selector} {
${declaration}
}`
}

export const cssRenderer: Renderer = {
	id: 'css',
	defaultFile: 'icons.css',
	render(icons) {
		return [
			{
				path: 'icons.css',
				content: `${BASE_RULE}\n\n${icons.map(ruleFor).join('\n\n')}\n`,
			},
		]
	},
}
