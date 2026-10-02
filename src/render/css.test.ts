import { describe, expect, test } from 'bun:test'

import type { NamedIcon } from './types.ts'

import { cssRenderer } from './css.ts'

const icons: NamedIcon[] = [
	{
		ref: { set: 'lucide', name: 'house' },
		body: '<path stroke="currentColor" opacity=".5" d="M3 12h18"/>',
		viewBox: '0 0 24 24',
		license: { spdx: 'ISC' },
		componentName: 'IconHouse',
		attrs: {},
		fileName: 'house',
		cssMode: 'mask',
	},
	{
		ref: { set: 'svgl', name: 'brand' },
		body: '<path fill="#ff0066" d="M0 0h32v32H0z"/>',
		viewBox: '0 0 32 32',
		license: { title: 'MIT' },
		componentName: 'IconBrand',
		attrs: {},
		fileName: 'brand',
		cssMode: 'image',
	},
]

describe('css renderer', () => {
	test('emits one deterministic, self-contained stylesheet', () => {
		const [first] = cssRenderer.render(icons)
		const [second] = cssRenderer.render(icons)

		expect(first).toEqual(second)
		expect(first?.path).toBe('icons.css')
		expect(first?.content).toContain('.sigil {')
		expect(first?.content).toContain('vertical-align: -0.125em')
		expect(first?.content).not.toContain('font-family')
		expect(first?.content).not.toContain('line-height')
		expect(first?.content.match(/data:image\/svg\+xml/g)).toHaveLength(2)
	})

	test('uses an alpha-preserving currentColor mask for monochrome icons', () => {
		const [file] = cssRenderer.render([icons[0]!])

		expect(file?.content).toContain('/* lucide/house · ISC */')
		expect(file?.content).toContain('.sigil-house')
		expect(file?.content).toContain('background-color: currentColor')
		expect(file?.content).toContain('mask-mode: alpha')
		expect(file?.content).toContain('%20opacity%3D%22.5%22')
		expect(file?.content).not.toContain('http://www.w3.org/2000/svg"')
	})

	test('stroke icons keep their root attributes inside the data URL', () => {
		const [file] = cssRenderer.render([
			{ ...icons[0]!, attrs: { fill: 'none', stroke: 'currentColor' } },
		])
		expect(file?.content).toContain(
			encodeURIComponent(' fill="none" stroke="currentColor">'),
		)
	})

	test('uses an authored-color background image for multicolor icons', () => {
		const [file] = cssRenderer.render([icons[1]!])

		expect(file?.content).toContain('/* svgl/brand · MIT */')
		expect(file?.content).toContain('.sigil-brand')
		expect(file?.content).toContain('background: url("data:image/svg+xml,')
		expect(file?.content).toContain('xmlns%3Axlink')
		expect(file?.content).toContain('%23ff0066')
		expect(file?.content).not.toContain('background-color: currentColor')
	})

	test('rejects ambiguous source color semantics', () => {
		expect(() =>
			cssRenderer.render([{ ...icons[0]!, cssMode: undefined }]),
		).toThrow('set "cssMode"')
	})
})
