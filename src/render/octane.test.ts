import { describe, expect, test } from 'bun:test'

import type { NamedIcon } from './types.ts'

import { octaneRenderer } from './octane.ts'

const icon: NamedIcon = {
	ref: { set: 'lucide', name: 'house' },
	body: '<g fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3" /></g>',
	viewBox: '0 0 24 24',
	license: { spdx: 'ISC' },
	componentName: 'LuHouse',
	fileName: 'lu-house',
}

describe('octaneRenderer', () => {
	test('emits a typed Octane .tsrx module', () => {
		const [file] = octaneRenderer.render([icon])

		expect(octaneRenderer.defaultFile).toBe('icons.tsrx')
		expect(file!.path).toBe('icons.tsrx')
		expect(file!.content).toContain(
			"import type { Octane } from 'octane/jsx-runtime'",
		)
		expect(file!.content).toContain(
			"export type IconProps = Octane.JSX.IntrinsicElements['svg']",
		)
		expect(file!.content).toContain(
			'export function LuHouse(props: IconProps) @{',
		)
	})

	test('uses React-shaped SVG attributes and keeps props overridable', () => {
		const [file] = octaneRenderer.render([icon])

		expect(file!.content).toContain('strokeWidth="2"')
		expect(file!.content).not.toContain('stroke-width')
		expect(file!.content).toContain('viewBox="0 0 24 24" {...svgProps}>')
	})

	test('emits an Octane-native atlas sidecar', () => {
		const [iconsFile, atlasFile] = octaneRenderer.render([icon], {
			atlas: true,
			atlasFileName: 'icons.atlas.tsrx',
		})

		expect(iconsFile!.content).not.toContain('IconAtlas')
		expect(atlasFile!.path).toBe('icons.atlas.tsrx')
		expect(atlasFile!.content).toContain(
			"import { useEffect, useMemo, useRef, useState } from 'octane'",
		)
		expect(atlasFile!.content).not.toContain("from 'ripple'")
		expect(atlasFile!.content).toContain('export function IconAtlas')
		expect(atlasFile!.content).toContain(
			"import { LuHouse } from './icons.tsrx'",
		)
		expect(atlasFile!.content).toContain('<style>')
		expect(atlasFile!.content).not.toContain('{iconAtlasCss')
		expect(atlasFile!.content).toContain(
			'@for (const item of items; key item.ref)',
		)
		expect(atlasFile!.content).toContain(
			'<{item.Icon} className="sigil-atlas__icon"',
		)
	})
})
