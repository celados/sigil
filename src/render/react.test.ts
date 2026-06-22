import { describe, expect, test } from 'bun:test'

import type { NamedIcon } from './types.ts'

import { reactRenderer, toReactBody } from './react.ts'

const icon: NamedIcon = {
	ref: { set: 'lucide', name: 'house' },
	body: '<g fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3" /></g>',
	viewBox: '0 0 24 24',
	componentName: 'LuHouse',
	fileName: 'lu-house',
}

describe('toReactBody', () => {
	test('kebab attributes → camelCase', () => {
		expect(
			toReactBody(
				'<g fill-rule="evenodd" stroke-width="2" clip-path="url(#a)"/>',
			),
		).toBe('<g fillRule="evenodd" strokeWidth="2" clipPath="url(#a)"/>')
	})

	test('class and xlink:href special cases', () => {
		expect(toReactBody('<path class="x" xlink:href="#a"/>')).toBe(
			'<path className="x" xlinkHref="#a"/>',
		)
	})

	test('data-* and aria-* stay kebab', () => {
		expect(toReactBody('<path data-name="x" aria-hidden="true"/>')).toBe(
			'<path data-name="x" aria-hidden="true"/>',
		)
	})

	test('kebab inside attribute values is untouched', () => {
		expect(toReactBody('<path d="m1-2 3-4" fill="current-color"/>')).toBe(
			'<path d="m1-2 3-4" fill="current-color"/>',
		)
	})
})

describe('reactRenderer atlas', () => {
	test('does not emit the atlas by default', () => {
		const [file] = reactRenderer.render([icon])

		expect(file!.content).not.toContain('IconAtlas')
		expect(file!.content).not.toContain('useState')
	})

	test('emits a searchable preview component when requested', () => {
		const [iconsFile, atlasFile] = reactRenderer.render([icon], {
			atlas: true,
			atlasFileName: 'icons.atlas.tsx',
			atlasImportPath: './icons',
		})

		expect(iconsFile!.content).not.toContain('IconAtlas')
		expect(atlasFile!.path).toBe('icons.atlas.tsx')
		expect(atlasFile!.content).toContain(
			"import { useEffect, useMemo, useRef, useState } from 'react'",
		)
		expect(atlasFile!.content).toContain("import { LuHouse } from './icons'")
		expect(atlasFile!.content).toContain(
			"import type { IconProps } from './icons'",
		)
		expect(atlasFile!.content).toContain('const iconAtlasCss = ".sigil-atlas')
		expect(atlasFile!.content).toContain('export const iconAtlasItems')
		expect(atlasFile!.content).toContain(
			'{ ref: "lucide/house", name: "house", componentName: "LuHouse", Icon: LuHouse }',
		)
		expect(atlasFile!.content).toContain('export const IconAtlas')
		expect(atlasFile!.content).toContain(
			'placeholder={`Search ${iconAtlasItems.length} icons...`}',
		)
		expect(atlasFile!.content).toContain(
			'navigator.clipboard.writeText(item.ref)',
		)
		expect(atlasFile!.content).toContain('No icons match your search.')
	})
})
