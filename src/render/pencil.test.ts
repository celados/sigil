import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { NamedIcon } from './types.ts'

import { iconLayers, pencilRenderer } from './pencil.ts'

const lucide = (name: string, body: string): NamedIcon => ({
	ref: { set: 'lucide', name },
	body,
	viewBox: '0 0 24 24',
	componentName: `Icon${name[0]!.toUpperCase()}${name.slice(1)}`,
	attrs: {
		fill: 'none',
		stroke: 'currentColor',
		'stroke-width': '2',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
	},
	fileName: name,
})

const house = lucide(
	'house',
	'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
)
const check = lucide(
	'check',
	'<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
)
const duotone: NamedIcon = {
	ref: { set: 'ph', name: 'square' },
	body: '<rect x="32" y="32" width="192" height="192" rx="8" opacity="0.2"/><path d="M40 40h176v176H40z" fill="none" stroke="currentColor" stroke-width="16"/>',
	viewBox: '0 0 256 256',
	componentName: 'IconSquare',
	attrs: { fill: 'currentColor' },
	fileName: 'square',
}

describe('iconLayers', () => {
	test('stroke-only shapes merge into one layer with the root paint', () => {
		expect(iconLayers(house)).toEqual([
			{
				d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
				stroke: 'currentColor',
				strokeWidth: 2,
				linecap: 'round',
				linejoin: 'round',
			},
		])
	})

	test('shapes become path data; a leading m stays absolute after concatenation', () => {
		expect(iconLayers(check)[0]!.d).toBe(
			'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0zM16 9l-5.5 5.5L8 12',
		)
	})

	test('fills and opacity keep one layer per shape in painting order', () => {
		expect(iconLayers(duotone)).toEqual([
			{
				d: 'M40 32h176a8 8 0 0 1 8 8v176a8 8 0 0 1 -8 8h-176a8 8 0 0 1 -8 -8v-176a8 8 0 0 1 8 -8z',
				fill: 'currentColor',
				opacity: 0.2,
			},
			{ d: 'M40 40h176v176H40z', stroke: 'currentColor', strokeWidth: 16 },
		])
	})

	test('paint Pen cannot draw fails with the reason', () => {
		expect(() =>
			pencilRenderer.render([
				{ ...house, body: '<path d="M0 0h1" fill="url(#g)"/>', attrs: {} },
			]),
		).toThrow('lucide/house: fill "url(#g)" is not a solid color')
		expect(() =>
			pencilRenderer.render([
				{ ...house, body: '<path d="M0 0" transform="scale(2)"/>' },
			]),
		).toThrow('<path transform> is not supported')
	})
})

// The generated module is real pencil TSX: shoot it with the pencil CLI and
// let Pen-compatible rendering prove the geometry, sizes, and paint.
test('etched icons render in a pencil design', async () => {
	const dir = join(import.meta.dir, '../../.scratch/pencil-render')
	mkdirSync(dir, { recursive: true })
	const [file] = pencilRenderer.render([house, check, duotone])
	writeFileSync(join(dir, 'icons.tsx'), file!.content)
	writeFileSync(
		join(dir, 'icons.pen.tsx'),
		`import { Frame } from '@celados/pencil'
import { IconCheck, IconHouse, IconSquare } from './icons.tsx'

export default (
	<Frame id="row" gap={8} padding={8} fill="#FFFFFF">
		<IconHouse id="house" size={16} color="#111827" />
		<IconCheck id="check" size={32} color="#2563EB" strokeWidth={1.5} />
		<IconSquare id="square" size={32} color="#111827" />
	</Frame>
)
`,
	)
	const proc = Bun.spawnSync(
		[
			'bun',
			'node_modules/.bin/pencil',
			'shot',
			`{ entry: '${join(dir, 'icons.pen.tsx')}', node: ['house', 'check', 'square'], out: '${dir}' }`,
		],
		{ cwd: join(import.meta.dir, '../..') },
	)
	const out = proc.stdout.toString()
	expect(proc.stderr.toString()).toBe('')
	expect(out).toContain('size: 16x16')
	expect(out).toContain('size: 32x32')
	expect(out).not.toContain('warnings')
}, 60_000)
