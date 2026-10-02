import { describe, expect, test } from 'bun:test'

import { hoistPresentation } from './svg-attrs.ts'

const STROKE = {
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '2',
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
}

describe('hoistPresentation', () => {
	test('bad sample: stroke attrs on an inner <g> move to the root', () => {
		// Iconify 归一化 lucide 的真实形状;<g stroke-width> 会挡住 svg 上的 CSS 线宽
		const out = hoistPresentation(
			'<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/><circle cx="12" cy="12" r="3"/></g>',
		)
		expect(out.attrs).toEqual(STROKE)
		expect(out.body).toBe(
			'<path d="m9 18 6-6-6-6"/><circle cx="12" cy="12" r="3"/>',
		)
		expect(out.body).not.toContain('stroke')
	})

	test('per-path stroke attrs (hugeicons/tabler on Iconify, Untitled UI) are hoisted', () => {
		const out = hoistPresentation(
			'<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M1 1"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2 2"/>',
		)
		expect(out.attrs['stroke-width']).toBe('1.5')
		expect(out.body).toBe('<path d="M1 1"/><path d="M2 2"/>')
	})

	test('a differing value is necessary information and stays', () => {
		const out = hoistPresentation(
			'<g fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1"/><circle fill="currentColor" stroke-width="2" r="1"/></g>',
		)
		expect(out.attrs['stroke-width']).toBe('2')
		expect(out.body).toBe('<path d="M1 1"/><circle fill="currentColor" r="1"/>')
	})

	test('tabler invisible bounding box is dropped', () => {
		const out = hoistPresentation(
			'<g fill="none" stroke="currentColor" stroke-width="2"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M1 1"/></g>',
		)
		expect(out.body).toBe('<path d="M1 1"/>')
	})

	test('fill icons are never polluted with stroke attrs', () => {
		const out = hoistPresentation(
			'<path fill="currentColor" d="M1 1"/><path fill="currentColor" opacity=".2" d="M2 2"/>',
		)
		expect(out.attrs).toEqual({ fill: 'currentColor' })
		expect(out.body).toBe('<path d="M1 1"/><path opacity=".2" d="M2 2"/>')
	})

	test('a <g> carrying non-presentation attrs is not unwrapped', () => {
		const body = '<g fill="none" transform="rotate(90)"><path d="M1 1"/></g>'
		const out = hoistPresentation(body)
		expect(out.body).toContain('transform="rotate(90)"')
	})

	test('multi-color icons keep per-element fills', () => {
		const body = '<path fill="#f00" d="M1 1"/><path fill="#0f0" d="M2 2"/>'
		expect(hoistPresentation(body)).toEqual({ body, attrs: {} })
	})
})
