import { describe, expect, test } from 'bun:test'

import { multiply, parsePath, parseTransform, pathBounds } from './geometry.ts'

describe('parsePath', () => {
	test('relative commands, H/V and implicit repeats become absolute', () => {
		expect(parsePath('m2 3 4 0h1v2l-1 1z')).toEqual([
			{ k: 'M', x: 2, y: 3 },
			{ k: 'L', x: 6, y: 3 },
			{ k: 'L', x: 7, y: 3 },
			{ k: 'L', x: 7, y: 5 },
			{ k: 'L', x: 6, y: 6 },
			{ k: 'Z' },
		])
	})

	test('packed arc flags and numbers without separators', () => {
		expect(parsePath('M0 0a1 1 0 011 1A2.5.5 30 10-1-1')).toEqual([
			{ k: 'M', x: 0, y: 0 },
			{
				k: 'A',
				rx: 1,
				ry: 1,
				rotation: 0,
				large: false,
				sweep: true,
				x: 1,
				y: 1,
			},
			{
				k: 'A',
				rx: 2.5,
				ry: 0.5,
				rotation: 30,
				large: true,
				sweep: false,
				x: -1,
				y: -1,
			},
		])
	})

	test('S and T reflect the previous control point', () => {
		expect(parsePath('M0 0C0 1 1 1 1 0S2 -1 2 0Q3 1 4 0T6 0')).toEqual([
			{ k: 'M', x: 0, y: 0 },
			{ k: 'C', x1: 0, y1: 1, x2: 1, y2: 1, x: 1, y: 0 },
			{ k: 'C', x1: 1, y1: -1, x2: 2, y2: -1, x: 2, y: 0 },
			{ k: 'Q', x1: 3, y1: 1, x: 4, y: 0 },
			{ k: 'Q', x1: 5, y1: -1, x: 6, y: 0 },
		])
	})

	test('after z a relative command starts from the subpath start', () => {
		expect(parsePath('M1 1h2v2zl1 0').at(-1)).toEqual({ k: 'L', x: 2, y: 1 })
	})

	test('malformed data fails with the place it broke', () => {
		expect(() => parsePath('M0 0LNaN')).toThrow(
			'malformed path data near "NaN"',
		)
	})
})

test('pathBounds excludes control points and follows arcs', () => {
	// A circle of radius 10 around (12, 12), drawn as two arcs.
	expect(
		pathBounds(parsePath('M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0z')).map(
			(v) => Math.round(v * 100) / 100,
		),
	).toEqual([2, 2, 20, 20])
	// The control points reach y=10, the curve only y=7.5.
	expect(pathBounds(parsePath('M0 0C0 10 10 10 10 0'))[3]).toBeCloseTo(7.5)
})

test('parseTransform composes left to right', () => {
	expect(parseTransform('translate(10 5) scale(2)')).toEqual([
		2, 0, 0, 2, 10, 5,
	])
	const r = parseTransform('rotate(90 1 1)')
	// (2, 1) rotates about (1, 1) to (1, 2).
	expect(r[0] * 2 + r[2] * 1 + r[4]).toBeCloseTo(1)
	expect(r[1] * 2 + r[3] * 1 + r[5]).toBeCloseTo(2)
	expect(multiply([1, 0, 0, 1, 3, 0], [2, 0, 0, 2, 0, 0])).toEqual([
		2, 0, 0, 2, 3, 0,
	])
})
