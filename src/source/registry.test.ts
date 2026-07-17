import { describe, expect, test } from 'bun:test'

import { sourceFor } from './registry.ts'

describe('source CSS modes', () => {
	test('bundled monochrome and full-color adapters declare safe defaults', () => {
		expect(sourceFor('lucide', 'vendor').cssMode?.('lucide')).toBe('mask')
		expect(sourceFor('ph', 'vendor').cssMode?.('ph')).toBe('mask')
		expect(sourceFor('svgl', 'vendor').cssMode?.('svgl')).toBe('image')
	})

	test('the long-tail fallback stays explicit instead of guessing', () => {
		expect(sourceFor('private-icons', 'vendor').cssMode).toBeUndefined()
	})
})
