import { describe, expect, test } from 'bun:test'

import { normalizeSvg } from './lucide.ts'
import { createSvglSource } from './svgl.ts'

// svgl 上游 google.svg 的精简版本,含 <defs>/linearGradient/多色路径
// 用于离线验证:normalizeSvg 不剥离颜色,replaceIDs 给 <defs> ID 做唯一化
const GOOGLE_FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="gBlue">
      <stop offset="0" stop-color="#4285f4"/>
      <stop offset="1" stop-color="#34a853"/>
    </linearGradient>
    <linearGradient id="gRed">
      <stop offset="0" stop-color="#ea4335"/>
    </linearGradient>
  </defs>
  <rect fill="url(#gBlue)" width="50" height="100"/>
  <rect fill="url(#gRed)" x="50" width="50" height="100"/>
</svg>`

// svelte.svg 简化版:填充型 brand logo,有 #FF3E00 和 #FFF 两色
const SVELTE_FIXTURE = `<svg viewBox="0 0 256 308" xmlns="http://www.w3.org/2000/svg">
  <path d="M239.682 40.707" fill="#FF3E00"/>
  <path d="M106.889 270.841" fill="#FFF"/>
</svg>`

describe('normalizeSvg — svgl brand logo fixtures', () => {
	test('多色 logo: 颜色保留,不注入 currentColor', () => {
		const result = normalizeSvg(SVELTE_FIXTURE)!
		expect(result).not.toBeNull()
		expect(result.viewBox).toBe('0 0 256 308')
		// 品牌色必须保留
		expect(result.body).toContain('#FF3E00')
		expect(result.body).toContain('#FFF')
		// 不应出现 currentColor
		expect(result.body).not.toContain('currentColor')
	})

	test('含 <defs>/linearGradient: 颜色保留,replaceIDs 防 ID 碰撞', () => {
		const r1 = normalizeSvg(GOOGLE_FIXTURE)!
		const r2 = normalizeSvg(GOOGLE_FIXTURE)!
		expect(r1).not.toBeNull()
		expect(r1.viewBox).toBe('0 0 100 100')

		// 颜色保留
		expect(r1.body).toContain('#4285f4')
		expect(r1.body).toContain('#ea4335')
		expect(r1.body).toContain('linearGradient')

		// replaceIDs 重命名了 ID(第一次调用 id="gBlue" 保留原名或重命名均可,
		// 但两次调用的 ID 必须不同——防同一页面多实例时 DOM ID 冲突)
		const id1 = r1.body.match(/id="([^"]+)"/)?.[1]
		const id2 = r2.body.match(/id="([^"]+)"/)?.[1]
		// url() 引用与 id 保持一致(即 replaceIDs 内部一致性)
		expect(r1.body).toContain(`url(#${id1})`)
		// 两次 normalize 同一 SVG 时,ID 命名不同(replaceIDs 全局计数器保证唯一)
		expect(id1).not.toBe(id2)
	})
})

// 真实 vendor + 搜索 + 解析:SIGIL_E2E=1 bun test 时跑
describe.skipIf(!process.env['SIGIL_E2E'])('svgl e2e', () => {
	const source = createSvglSource('.scratch/vendor-test/svgl')

	test('vendor + search + resolve normal/dark/missing/color', async () => {
		// vendor 幂等:重跑不应报错
		await source.vendor!()
		expect(source.vendored!()).toBe(true)

		// search — 包含 'github' 的结果
		const searchResult = await source.search('github', { limit: 20 })
		expect(searchResult.hits.length).toBeGreaterThan(0)
		expect(searchResult.hits.every((h) => h.set === 'svgl')).toBe(true)
		const names = searchResult.hits.map((h) => h.name)
		// 'github-dark' 对应上游 github_dark.svg(下划线转连字符后的 sigil 名)
		expect(names).toContain('github-dark')
		expect(names).toContain('github-light')
		// search 返回的 ref 名必须符合 sigil 合法格式(仅 a-z0-9-)
		for (const name of names) {
			expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		}

		// resolve 普通 logo(svelte:单文件无变体)
		const { icons: svelteIcons, missing: svelteMissing } = await source.resolve(
			[{ set: 'svgl', name: 'svelte' }],
		)
		expect(svelteMissing).toHaveLength(0)
		expect(svelteIcons).toHaveLength(1)
		const svelte = svelteIcons[0]!
		// svelte logo 包含 #FF3E00 品牌色
		expect(svelte.body).toContain('#FF3E00')
		// 不能有 currentColor 注入
		expect(svelte.body).not.toContain('currentColor')
		expect(svelte.viewBox).toBeTruthy()

		// resolve dark 变体(上游 github_dark.svg,sigil 名 github-dark)
		const { icons: darkIcons, missing: darkMissing } = await source.resolve([
			{ set: 'svgl', name: 'github-dark' },
		])
		expect(darkMissing).toHaveLength(0)
		expect(darkIcons).toHaveLength(1)
		const dark = darkIcons[0]!
		expect(dark.ref.name).toBe('github-dark')
		expect(dark.viewBox).toBeTruthy()

		// resolve missing — 不抛错,走 missing 列表
		const { icons: missingIcons, missing: missingList } = await source.resolve([
			{ set: 'svgl', name: 'definitely-not-a-real-logo-zzz9' },
		])
		expect(missingIcons).toHaveLength(0)
		expect(missingList).toEqual([
			{ set: 'svgl', name: 'definitely-not-a-real-logo-zzz9' },
		])

		// 彩色保留:resolve google(含 linearGradient 的多色 logo)
		const { icons: googleIcons } = await source.resolve([
			{ set: 'svgl', name: 'google' },
		])
		if (googleIcons.length > 0) {
			const google = googleIcons[0]!
			// google.svg 含 linearGradient
			expect(google.body).toContain('linearGradient')
			// 不应含 currentColor
			expect(google.body).not.toContain('currentColor')
		}
	}, 120_000)
})
