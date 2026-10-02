import { describe, expect, test } from 'bun:test'

import { parseRef } from '../ref.ts'
import { FF_SETS, FF_SLOTS, ffRef } from './ff.ts'

describe('ff preset', () => {
	test('every set maps every slot to a valid ref', () => {
		for (const set of FF_SETS) {
			for (const slot of FF_SLOTS) {
				expect(() => parseRef(ffRef(set, slot))).not.toThrow()
			}
		}
	})

	test('renamed glyphs and cross-library fallbacks', () => {
		expect(ffRef('lucide', 'search')).toBe('lucide/search')
		expect(ffRef('lucide', 'more-horizontal')).toBe('lucide/ellipsis')
		expect(ffRef('tabler', 'menu')).toBe('tabler/menu-2')
		expect(ffRef('hugeicons', 'play')).toBe('lucide/play')
	})
})
