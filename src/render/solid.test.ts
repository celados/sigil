import { describe, expect, test } from 'bun:test'

import type { NamedIcon } from './types.ts'

import { solidRenderer } from './solid.ts'

const icon: NamedIcon = {
	ref: { set: 'lucide', name: 'house' },
	body: '<path d="M3 3" />',
	viewBox: '0 0 24 24',
	componentName: 'LuHouse',
	fileName: 'lu-house',
}

describe('solidRenderer', () => {
	test('emits Solid 2 prop and JSX APIs', () => {
		const [file] = solidRenderer.render([icon])
		const content = file!.content

		expect(content).toContain("import { omit } from 'solid-js'")
		expect(content).toContain("import type { JSX } from '@solidjs/web'")
		expect(content).toContain(
			"Omit<JSX.SvgSVGAttributes<SVGSVGElement>, 'viewBox'>",
		)
		expect(content).toContain("const rest = omit(props, 'size')")
		expect(content).toContain("width={props.size ?? '1em'}")
		expect(content).not.toContain('splitProps')
	})

	test('emits a Solid 2 atlas when requested', () => {
		const [, atlasFile] = solidRenderer.render([icon], {
			atlas: true,
			atlasFileName: 'icons.atlas.tsx',
			atlasImportPath: './icons',
		})
		const content = atlasFile!.content

		expect(content).toContain(
			"import { For, createMemo, createSignal, onCleanup, onSettled } from 'solid-js'",
		)
		expect(content).toContain("import type { JSX } from '@solidjs/web'")
		expect(content).toContain('onSettled(() => {')
		expect(content).not.toContain('onMount')
	})
})
