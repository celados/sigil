import { describe, expect, test } from 'bun:test'

import { derivePrefix, iconifySource } from './iconify.ts'

describe('derivePrefix', () => {
	test('single word → first two letters', () => {
		expect(derivePrefix('lucide')).toBe('Lu')
		expect(derivePrefix('tabler')).toBe('Ta')
		expect(derivePrefix('mdi')).toBe('Md')
		expect(derivePrefix('ph')).toBe('Ph')
	})

	test('multi part → initials, disambiguates icon-park family', () => {
		expect(derivePrefix('simple-icons')).toBe('Si')
		expect(derivePrefix('material-symbols')).toBe('Ms')
		expect(derivePrefix('icon-park-outline')).toBe('Ipo')
		expect(derivePrefix('icon-park-solid')).toBe('Ips')
		expect(derivePrefix('fa6-solid')).toBe('Fs')
	})
})

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
