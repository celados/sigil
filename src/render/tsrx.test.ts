import { describe, expect, test } from 'bun:test'

import type { NamedIcon } from './types.ts'

import { tsrxRenderer } from './tsrx.ts'

const icon: NamedIcon = {
	ref: { set: 'lucide', name: 'house' },
	// native SVG body (Iconify shape): kebab attributes, no className
	body: '<g fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3" /></g>',
	viewBox: '0 0 24 24',
	license: { spdx: 'ISC' },
	componentName: 'LuHouse',
	fileName: 'lu-house',
}

describe('tsrxRenderer', () => {
	const [file] = tsrxRenderer.render([icon])

	test('emits a single .tsrx module', () => {
		expect(tsrxRenderer.defaultFile).toBe('icons.tsrx')
		expect(file!.path).toBe('icons.tsrx')
	})

	test('component uses the @{ } code-block body with a default-valued lazy prop', () => {
		expect(file!.content).toContain(
			"export function LuHouse(&{ size = '1em', ...props }: IconProps) @{",
		)
		// @{ } body emits the markup as the trailing output node — no return.
		expect(file!.content).not.toContain('return (')
		// default lives in the param, so the JSX attr is a bare `size`
		expect(file!.content).toContain('width={size} height={size}')
		expect(file!.content).not.toContain("?? '1em'")
		expect(file!.content).toContain('viewBox="0 0 24 24"')
		expect(file!.content).toContain('{...props}')
	})

	test('native SVG attributes are kept as-is (Ripple convention)', () => {
		// must NOT be React-style camelCase
		expect(file!.content).toContain('stroke-width="2"')
		expect(file!.content).not.toContain('strokeWidth')
		expect(file!.content).not.toContain('className')
	})

	test('header types IconProps off Ripple’s svg intrinsic attrs plus size', () => {
		expect(file!.content).toContain(
			"export type IconProps = JSX.IntrinsicElements['svg'] & { size?: number | string }",
		)
		// no loose escape hatch
		expect(file!.content).not.toContain('[attr: string]: unknown')
	})

	test('atlas emits a TSRX sidecar with native style block', () => {
		const [iconsFile, atlasFile] = tsrxRenderer.render([icon], {
			atlas: true,
			atlasFileName: 'icons.atlas.tsrx',
			atlasImportPath: './icons',
		})

		expect(iconsFile!.content).not.toContain('IconAtlas')
		expect(atlasFile!.path).toBe('icons.atlas.tsrx')
		expect(atlasFile!.content).toContain("import { track } from 'ripple'")
		expect(atlasFile!.content).toContain("import { LuHouse } from './icons'")
		expect(atlasFile!.content).toContain('export function IconAtlas')
		expect(atlasFile!.content).toContain('<style>')
		expect(atlasFile!.content).toContain('.sigil-atlas')
		expect(atlasFile!.content).toContain(
			'@for (const item of items(); key item.ref)',
		)
		expect(atlasFile!.content).toContain(
			'<{item.Icon} class="sigil-atlas__icon"',
		)
	})
})
