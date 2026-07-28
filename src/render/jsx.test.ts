import { describe, expect, test } from 'bun:test'

import { toJsxBody } from './jsx.ts'

describe('toJsxBody', () => {
	test('converts kebab attributes to camelCase', () => {
		expect(
			toJsxBody(
				'<g fill-rule="evenodd" stroke-width="2" clip-path="url(#a)"/>',
			),
		).toBe('<g fillRule="evenodd" strokeWidth="2" clipPath="url(#a)"/>')
	})

	test('converts class and xlink:href', () => {
		expect(toJsxBody('<path class="x" xlink:href="#a"/>')).toBe(
			'<path className="x" xlinkHref="#a"/>',
		)
	})

	test('preserves data and aria attributes', () => {
		expect(toJsxBody('<path data-name="x" aria-hidden="true"/>')).toBe(
			'<path data-name="x" aria-hidden="true"/>',
		)
	})

	test('does not rewrite attribute values', () => {
		expect(toJsxBody('<path d="m1-2 3-4" fill="current-color"/>')).toBe(
			'<path d="m1-2 3-4" fill="current-color"/>',
		)
	})
})
