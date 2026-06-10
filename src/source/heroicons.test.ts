import { describe, expect, test } from 'bun:test'

import { createHeroiconsSource } from './heroicons.ts'
import { normalizeSvg } from './lucide.ts'

// 上游真实形状:24 outline — 根属性 fill="none" + stroke="currentColor"
const FIXTURE_OUTLINE = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" data-slot="icon">
  <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12"/>
</svg>`

// 上游真实形状:24 solid — 根属性 fill="currentColor"
const FIXTURE_SOLID = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-slot="icon">
  <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061"/>
</svg>`

// 上游真实形状:20 solid
const FIXTURE_20_SOLID = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" data-slot="icon">
  <path fill-rule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11z" clip-rule="evenodd"/>
</svg>`

describe('normalizeSvg (heroicons fixtures)', () => {
	test('outline: root stroke semantics wrapped into <g>', () => {
		const result = normalizeSvg(FIXTURE_OUTLINE)!
		expect(result.viewBox).toBe('0 0 24 24')
		// outline 语义:fill=none + stroke=currentColor 应收进 <g>
		expect(result.body).toContain('<g fill="none"')
		expect(result.body).toContain('stroke="currentColor"')
		expect(result.body).toContain('stroke-width="1.5"')
	})

	test('solid: root fill=currentColor wrapped into <g>', () => {
		const result = normalizeSvg(FIXTURE_SOLID)!
		expect(result.viewBox).toBe('0 0 24 24')
		// solid 语义:fill=currentColor 应收进 <g>,不含 stroke
		expect(result.body).toContain('<g fill="currentColor"')
		expect(result.body).not.toContain('stroke=')
	})

	test('20-solid: viewBox 0 0 20 20', () => {
		const result = normalizeSvg(FIXTURE_20_SOLID)!
		expect(result.viewBox).toBe('0 0 20 20')
		expect(result.body).toContain('<g fill="currentColor"')
	})
})

// 真实 vendor(网络 + git):SIGIL_E2E=1 bun test 时跑
describe.skipIf(!process.env['SIGIL_E2E'])('heroicons e2e', () => {
	const source = createHeroiconsSource('.scratch/vendor-test/heroicons')

	test('vendor + vendored flag', async () => {
		await source.vendor!()
		expect(source.vendored!()).toBe(true)
	}, 120_000)

	test('search returns base names only (variant is set-level config)', async () => {
		const result = await source.search('home', { limit: 20 })
		expect(result.hits.length).toBeGreaterThan(0)
		expect(result.hits[0]!.set).toBe('heroicons')

		const names = result.hits.map((h) => h.name)
		expect(names).toContain('home')
		expect(names.some((n) => n.endsWith('-solid'))).toBe(false)
	}, 30_000)

	test('resolve: outline (home) — stroke semantics preserved', async () => {
		const { icons, missing } = await source.resolve([
			{ set: 'heroicons', name: 'home' },
		])
		expect(icons).toHaveLength(1)
		expect(missing).toHaveLength(0)
		const icon = icons[0]!
		expect(icon.viewBox).toBe('0 0 24 24')
		// outline 型:body 里有 stroke="currentColor"
		expect(icon.body).toContain('stroke="currentColor"')
	}, 30_000)

	test('resolve: solid (home-solid) — fill semantics preserved', async () => {
		const { icons, missing } = await source.resolve([
			{ set: 'heroicons', name: 'home-solid' },
		])
		expect(icons).toHaveLength(1)
		expect(missing).toHaveLength(0)
		const icon = icons[0]!
		expect(icon.viewBox).toBe('0 0 24 24')
		// solid 型:body 里有 fill="currentColor",无 stroke
		expect(icon.body).toContain('fill="currentColor"')
		expect(icon.body).not.toContain('stroke=')
	}, 30_000)

	test('resolve: 20-solid (home-20-solid) — correct viewBox', async () => {
		const { icons } = await source.resolve([
			{ set: 'heroicons', name: 'home-20-solid' },
		])
		expect(icons).toHaveLength(1)
		expect(icons[0]!.viewBox).toBe('0 0 20 20')
	}, 30_000)

	test('resolve: 16-solid (home-16-solid) — correct viewBox', async () => {
		const { icons } = await source.resolve([
			{ set: 'heroicons', name: 'home-16-solid' },
		])
		expect(icons).toHaveLength(1)
		expect(icons[0]!.viewBox).toBe('0 0 16 16')
	}, 30_000)

	test('resolve: missing icon reported correctly', async () => {
		const { icons, missing } = await source.resolve([
			{ set: 'heroicons', name: 'definitely-not-real-zzz' },
		])
		expect(icons).toHaveLength(0)
		expect(missing).toEqual([
			{ set: 'heroicons', name: 'definitely-not-real-zzz' },
		])
	}, 30_000)

	test('license is MIT', async () => {
		const { icons } = await source.resolve([{ set: 'heroicons', name: 'home' }])
		expect(icons[0]!.license?.spdx).toBe('MIT')
	}, 30_000)
})
