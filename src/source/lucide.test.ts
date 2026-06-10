import { describe, expect, test } from 'bun:test'

import { createLucideSource, normalizeSvg } from './lucide.ts'

// 真实 lucide 上游 SVG 形状:根属性带描边语义
const FIXTURE = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
</svg>`

describe('normalizeSvg', () => {
	test('keeps root stroke semantics by wrapping body in <g>', () => {
		const result = normalizeSvg(FIXTURE)!
		expect(result.viewBox).toBe('0 0 24 24')
		expect(result.body).toContain('<g fill="none" stroke="currentColor"')
		expect(result.body).toContain('stroke-width="2"')
		expect(result.body).toContain(
			'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"',
		)
	})

	test('rejects non-svg input', () => {
		expect(normalizeSvg('not svg')).toBeNull()
	})
})

// 真实 vendor(网络 + git):SIGIL_E2E=1 bun test 时跑
describe.skipIf(!process.env['SIGIL_E2E'])('lucide e2e', () => {
	const source = createLucideSource('.scratch/vendor-test/lucide')

	test('vendor + search + resolve', async () => {
		await source.vendor!()
		expect(source.vendored!()).toBe(true)

		const result = await source.search('house', { limit: 10 })
		expect(result.hits.length).toBeGreaterThan(0)
		expect(result.hits[0]!.set).toBe('lucide')

		const { icons, missing } = await source.resolve([
			{ set: 'lucide', name: 'house' },
			{ set: 'lucide', name: 'definitely-not-real-zzz' },
		])
		expect(icons).toHaveLength(1)
		expect(icons[0]!.viewBox).toBe('0 0 24 24')
		expect(icons[0]!.body).toContain('stroke="currentColor"')
		expect(missing).toEqual([
			{ set: 'lucide', name: 'definitely-not-real-zzz' },
		])
	}, 120_000)
})
