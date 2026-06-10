import { describe, expect, test } from 'bun:test'

import { normalizeSvg } from './lucide.ts'
import { createPhSource } from './ph.ts'

// 真实 phosphor regular SVG 形状:根上只有 fill="currentColor",viewBox 256×256
const REGULAR_FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">
  <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68Z"/>
</svg>`

// duotone 含 opacity 层——验证 normalizeSvg 能正确保留 opacity 属性
const DUOTONE_FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">
  <path d="M216,120v96H152V152H104v64H40V120a8,8,0,0,1,2.34-5.66l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,216,120Z" opacity="0.2"/>
  <path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68Z"/>
</svg>`

describe('normalizeSvg — phosphor fixtures', () => {
	test('regular: viewBox 0 0 256 256, fill 语义保留', () => {
		const result = normalizeSvg(REGULAR_FIXTURE)!
		expect(result).not.toBeNull()
		expect(result.viewBox).toBe('0 0 256 256')
		// fill="currentColor" 被收进 <g> 或直接保留在 body 里
		expect(result.body).toContain('fill="currentColor"')
	})

	test('duotone: opacity 属性保留,body 包含两个 <path>', () => {
		const result = normalizeSvg(DUOTONE_FIXTURE)!
		expect(result).not.toBeNull()
		expect(result.viewBox).toBe('0 0 256 256')
		// duotone 的半透明层必须保留 opacity
		expect(result.body).toContain('opacity')
	})
})

// 真实 vendor + 搜索 + 解析:SIGIL_E2E=1 bun test 时跑
describe.skipIf(!process.env['SIGIL_E2E'])('ph e2e', () => {
	const source = createPhSource('.scratch/vendor-test/ph')

	test('vendor + search + resolve regular & duotone', async () => {
		// vendor 幂等:重跑不应报错
		await source.vendor!()
		expect(source.vendored!()).toBe(true)

		// search 只列 base 名:weight 是 set 级配置(manifest variant),不展开变体
		const result = await source.search('house', { limit: 10 })
		expect(result.hits.length).toBeGreaterThan(0)
		expect(result.hits.every((h) => h.set === 'ph')).toBe(true)
		const names = result.hits.map((h) => h.name)
		expect(names).toContain('house')
		expect(names.some((n) => n.endsWith('-bold'))).toBe(false)

		// resolve regular — Iconify name = base name(无 weight 后缀)
		const { icons: regularIcons, missing: regularMissing } =
			await source.resolve([
				{ set: 'ph', name: 'house' },
				{ set: 'ph', name: 'definitely-not-real-zzz' },
			])
		expect(regularIcons).toHaveLength(1)
		expect(regularMissing).toEqual([
			{ set: 'ph', name: 'definitely-not-real-zzz' },
		])
		const regular = regularIcons[0]!
		expect(regular.viewBox).toBe('0 0 256 256')
		expect(regular.body).toContain('fill="currentColor"')

		// resolve duotone — opacity 层必须保留
		const { icons: duotoneIcons, missing: duotoneMissing } =
			await source.resolve([{ set: 'ph', name: 'house-duotone' }])
		expect(duotoneMissing).toHaveLength(0)
		expect(duotoneIcons).toHaveLength(1)
		const duotone = duotoneIcons[0]!
		expect(duotone.viewBox).toBe('0 0 256 256')
		expect(duotone.body).toContain('opacity')
	}, 120_000)
})
