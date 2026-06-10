import { describe, expect, test } from 'bun:test'

import { normalizeSvg } from './lucide.ts'
import { createTablerSource } from './tabler.ts'

// 真实 tabler outline SVG 形状:根属性带描边语义 + 文件头 tags 注释
const OUTLINE_FIXTURE = `<!--
tags: [house, dashboard, living, building, home, main, architecture]
category: Buildings
version: "1.0"
unicode: "eac1"
-->
<svg
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
  <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
  <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
  <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
</svg>`

// 真实 tabler filled SVG 形状:根属性 fill="currentColor",无 stroke
const FILLED_FIXTURE = `<!--
unicode: "fe2b"
version: "3.0"
-->
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="currentColor"
>
  <path d="M12.707 2.293l9 9c.63 .63 .184 1.707 -.707 1.707h-1v6a3 3 0 0 1 -3 3h-1v-7a3 3 0 0 0 -2.824 -2.995l-.176 -.005h-2a3 3 0 0 0 -3 3v7h-1a3 3 0 0 1 -3 -3v-6h-1c-.89 0 -1.337 -1.077 -.707 -1.707l9 -9a1 1 0 0 1 1.414 0m.293 11.707a1 1 0 0 1 1 1v7h-4v-7a1 1 0 0 1 .883 -.993l.117 -.007z" />
</svg>`

describe('normalizeSvg (tabler outline)', () => {
	test('outline: 保留根上描边语义,包裹进 <g>', () => {
		const result = normalizeSvg(OUTLINE_FIXTURE)!
		expect(result.viewBox).toBe('0 0 24 24')
		// parseSVGContent/convertParsedSVG 把根 fill="none" stroke="currentColor" 收进 <g>
		expect(result.body).toContain('<g fill="none" stroke="currentColor"')
		expect(result.body).toContain('stroke-width="2"')
	})

	test('filled: fill="currentColor" 语义保留在 body', () => {
		const result = normalizeSvg(FILLED_FIXTURE)!
		expect(result.viewBox).toBe('0 0 24 24')
		// filled 没有 stroke,归一化后 body 里 fill 应为 currentColor
		expect(result.body).toContain('fill="currentColor"')
		expect(result.body).not.toContain('stroke="currentColor"')
	})
})

// 真实 vendor(网络 + git):SIGIL_E2E=1 bun test 时跑
describe.skipIf(!process.env['SIGIL_E2E'])('tabler e2e', () => {
	const source = createTablerSource('.scratch/vendor-test/tabler')

	test('vendor + search + resolve outline + resolve filled', async () => {
		await source.vendor!()
		expect(source.vendored!()).toBe(true)

		// outline 搜索:home 在 outline 目录有多个匹配
		const outlineSearch = await source.search('home', { limit: 10 })
		expect(outlineSearch.hits.length).toBeGreaterThan(0)
		expect(outlineSearch.hits[0]!.set).toBe('tabler')
		expect(outlineSearch.hits.some((h) => h.name === 'home')).toBe(true)

		// filled 搜索:搜索 star-filled 精确验证 filled 命名(outline 不含 -filled 后缀)
		const filledSearch = await source.search('star-filled', { limit: 10 })
		const filledHit = filledSearch.hits.find((h) => h.name === 'star-filled')
		expect(filledHit).toBeDefined()

		// resolve outline:home — 描边型
		const { icons: outlineIcons, missing: outlineMissing } =
			await source.resolve([{ set: 'tabler', name: 'home' }])
		expect(outlineIcons).toHaveLength(1)
		expect(outlineMissing).toHaveLength(0)
		expect(outlineIcons[0]!.viewBox).toBe('0 0 24 24')
		// outline 归一化后 body 含描边语义
		expect(outlineIcons[0]!.body).toContain('stroke="currentColor"')

		// resolve filled:home-filled — 填充型
		const { icons: filledIcons, missing: filledMissing } = await source.resolve(
			[{ set: 'tabler', name: 'home-filled' }],
		)
		expect(filledIcons).toHaveLength(1)
		expect(filledMissing).toHaveLength(0)
		expect(filledIcons[0]!.viewBox).toBe('0 0 24 24')
		// filled 归一化后 body 含填充语义
		expect(filledIcons[0]!.body).toContain('fill="currentColor"')

		// license
		expect(filledIcons[0]!.license?.spdx).toBe('MIT')

		// 缺失图标应报告而非抛错
		const { icons: emptyIcons, missing } = await source.resolve([
			{ set: 'tabler', name: 'definitely-not-real-zzz' },
		])
		expect(emptyIcons).toHaveLength(0)
		expect(missing).toEqual([
			{ set: 'tabler', name: 'definitely-not-real-zzz' },
		])
	}, 180_000)
})
