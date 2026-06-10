import { describe, expect, test } from 'bun:test'

import { derivePrefix } from './iconify.ts'

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
