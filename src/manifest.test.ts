import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	assertNoCollisions,
	componentName,
	effectiveName,
	flatten,
	loadManifest,
	saveManifest,
} from './manifest.ts'

describe('effectiveName', () => {
	test('no variant → base name untouched', () => {
		expect(effectiveName('house', undefined, 'regular')).toBe('house')
	})

	test('variant equal to adapter default → no suffix', () => {
		expect(effectiveName('house', 'regular', 'regular')).toBe('house')
		expect(effectiveName('home', 'outline', 'outline')).toBe('home')
	})

	test('non-default variant → -suffix (iconify convention)', () => {
		expect(effectiveName('house', 'duotone', 'regular')).toBe('house-duotone')
		expect(effectiveName('home', '20-solid', 'outline')).toBe('home-20-solid')
		expect(effectiveName('star', 'filled', 'outline')).toBe('star-filled')
	})
})

describe('componentName', () => {
	test('Icon + PascalCase(base name) — no library prefix, variant never leaks in', () => {
		expect(componentName({ set: 'ph', name: 'airplane-taxiing' })).toBe(
			'IconAirplaneTaxiing',
		)
	})

	test('as replaces the name part, so a library swap keeps the component name', () => {
		expect(componentName({ set: 'lucide', name: 'house' })).toBe('IconHouse')
		expect(componentName({ set: 'tabler', name: 'home', as: 'House' })).toBe(
			'IconHouse',
		)
	})
})

describe('flatten + collisions', () => {
	const manifest = {
		lucide: { icons: ['house', { name: 'menu', as: 'Hamburger' }] },
		'simple-icons': { icons: ['github'] },
	}

	test('flatten expands set groups in order', () => {
		expect(flatten(manifest)).toEqual([
			{ set: 'lucide', name: 'house' },
			{ set: 'lucide', name: 'menu', as: 'Hamburger' },
			{ set: 'simple-icons', name: 'github' },
		])
	})

	test('cross-set same name collides — names are one app namespace', () => {
		expect(() =>
			assertNoCollisions(
				flatten({
					lucide: { icons: ['github'] },
					'simple-icons': { icons: ['github'] },
				}),
			),
		).toThrow('collision')
	})

	test('same-set duplicate via as collides loudly', () => {
		expect(() =>
			assertNoCollisions(
				flatten({
					lucide: { icons: ['github', { name: 'github-light', as: 'Github' }] },
				}),
			),
		).toThrow('collision')
	})
})

describe('cssMode', () => {
	test('saveManifest preserves a set-level override', () => {
		const dir = mkdtempSync(join(tmpdir(), 'sigil-manifest-'))
		const path = join(dir, 'icons.json')

		try {
			saveManifest(path, {
				custom: { cssMode: 'image', icons: ['logo'] },
			})
			expect(loadManifest(path)?.custom?.cssMode).toBe('image')
			expect(readFileSync(path, 'utf-8')).toContain('"cssMode": "image"')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test('loadManifest rejects the removed set-level prefix', () => {
		const dir = mkdtempSync(join(tmpdir(), 'sigil-manifest-'))
		const path = join(dir, 'icons.json')

		try {
			writeFileSync(path, '{"lucide":{"prefix":"Lu","icons":[]}}')
			expect(() => loadManifest(path)).toThrow('no longer exists')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})

	test('loadManifest rejects unknown modes', () => {
		const dir = mkdtempSync(join(tmpdir(), 'sigil-manifest-'))
		const path = join(dir, 'icons.json')

		try {
			writeFileSync(path, '{"custom":{"cssMode":"auto","icons":[]}}')
			expect(() => loadManifest(path)).toThrow('expected "mask" or "image"')
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})
