import { describe, expect, test } from 'bun:test'

import { iconifySource } from './iconify.ts'

describe('iconify search', () => {
	test('enforces the caller limit even when the API clamps it', async () => {
		const originalFetch = globalThis.fetch
		const mockedFetch: typeof fetch = Object.assign(
			async () =>
				new Response(
					JSON.stringify({
						icons: ['mdi:a', 'mdi:b', 'mdi:c'],
						total: 3,
						collections: {},
					}),
				),
			{ preconnect: originalFetch.preconnect },
		)
		globalThis.fetch = mockedFetch

		try {
			const result = await iconifySource.search('a', { limit: 1 })
			expect(result.hits).toEqual([{ set: 'mdi', name: 'a' }])
			expect(result.total).toBe(3)
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})
