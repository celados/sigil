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

	test('component is a plain TS function with lazy-destructured props', () => {
		expect(file!.content).toContain(
			'export function LuHouse(&{ size, ...props }: IconProps) {',
		)
		expect(file!.content).toContain('return (')
		expect(file!.content).toContain(
			"width={size ?? '1em'} height={size ?? '1em'}",
		)
		expect(file!.content).toContain('viewBox="0 0 24 24"')
		expect(file!.content).toContain('{...props}')
	})

	test('native SVG attributes are kept as-is (Ripple convention)', () => {
		// must NOT be React-style camelCase
		expect(file!.content).toContain('stroke-width="2"')
		expect(file!.content).not.toContain('strokeWidth')
		expect(file!.content).not.toContain('className')
	})

	test('header declares IconProps with size and a passthrough index', () => {
		expect(file!.content).toContain('export type IconProps = {')
		expect(file!.content).toContain('size?: number | string')
	})
})
