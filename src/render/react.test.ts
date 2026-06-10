import { describe, expect, test } from 'bun:test'

import { toReactBody } from './react.ts'

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
