import { describe, expect, test } from 'bun:test'

import { createSimpleIconsSource } from './simple-icons.ts'

// 真实 simple-icons 上游 SVG 形状：含 <title>，path 无 fill
const FIXTURE_GITHUB = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>GitHub</title><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`

describe('createSimpleIconsSource', () => {
	test('prefix returns Si', () => {
		const source = createSimpleIconsSource('/tmp/unused')
		expect(source.prefix('simple-icons')).toBe('Si')
	})

	test('id is simple-icons', () => {
		const source = createSimpleIconsSource('/tmp/unused')
		expect(source.id).toBe('simple-icons')
	})
})

describe('simple-icons normalize (fixture)', () => {
	// 直接测 stripAndNormalize 逻辑：从 resolve 走一遍 mock vendor 目录
	// 这里用内部行为间接验证：通过临时写文件再 resolve
	test('strips <title> and injects fill=currentColor', async () => {
		const tmp = `/tmp/sigil-si-test-${Date.now()}`
		const { mkdirSync, writeFileSync } = await import('node:fs')
		mkdirSync(`${tmp}/icons`, { recursive: true })
		writeFileSync(`${tmp}/icons/github.svg`, FIXTURE_GITHUB)

		const source = createSimpleIconsSource(tmp)
		const { icons, missing } = await source.resolve([
			{ set: 'simple-icons', name: 'github' },
		])

		expect(missing).toHaveLength(0)
		expect(icons).toHaveLength(1)

		const icon = icons[0]!
		expect(icon.viewBox).toBe('0 0 24 24')
		// title 必须被剥掉
		expect(icon.body).not.toContain('<title>')
		expect(icon.body).not.toContain('</title>')
		// fill="currentColor" 语义必须存在（通过 <g> 继承或直接在元素上）
		expect(icon.body).toContain('fill="currentColor"')
	})

	test('missing icon is reported, not thrown', async () => {
		const tmp = `/tmp/sigil-si-test-missing-${Date.now()}`
		const { mkdirSync } = await import('node:fs')
		mkdirSync(`${tmp}/icons`, { recursive: true })

		const source = createSimpleIconsSource(tmp)
		const { icons, missing } = await source.resolve([
			{ set: 'simple-icons', name: 'nonexistent-zzz' },
		])
		expect(icons).toHaveLength(0)
		expect(missing).toEqual([{ set: 'simple-icons', name: 'nonexistent-zzz' }])
	})

	test('search filters by slug substring', async () => {
		const tmp = `/tmp/sigil-si-test-search-${Date.now()}`
		const { mkdirSync, writeFileSync } = await import('node:fs')
		mkdirSync(`${tmp}/icons`, { recursive: true })
		writeFileSync(`${tmp}/icons/github.svg`, FIXTURE_GITHUB)
		writeFileSync(`${tmp}/icons/githubactions.svg`, FIXTURE_GITHUB)
		writeFileSync(`${tmp}/icons/gitlab.svg`, FIXTURE_GITHUB)

		const source = createSimpleIconsSource(tmp)
		const result = await source.search('github')

		expect(result.hits.length).toBe(2)
		expect(result.hits.every((h) => h.set === 'simple-icons')).toBe(true)
		expect(result.sets['simple-icons']?.license).toBe('CC0-1.0')
	})
})

// 真实 vendor（网络 + git）：SIGIL_E2E=1 bun test 时跑
describe.skipIf(!process.env['SIGIL_E2E'])('simple-icons e2e', () => {
	const source = createSimpleIconsSource('.scratch/vendor-test/simple-icons')

	test('vendor + search + resolve (github, githubactions, dotnet)', async () => {
		await source.vendor!()
		expect(source.vendored!()).toBe(true)

		// 搜索验证
		const searchResult = await source.search('github', { limit: 10 })
		expect(searchResult.hits.length).toBeGreaterThan(0)
		expect(searchResult.hits[0]!.set).toBe('simple-icons')

		// 解析验证：三个已知 slug 对照 Iconify API 验证过的命名
		const { icons, missing } = await source.resolve([
			{ set: 'simple-icons', name: 'github' },
			{ set: 'simple-icons', name: 'githubactions' },
			{ set: 'simple-icons', name: 'dotnet' },
			{ set: 'simple-icons', name: 'definitely-not-real-zzz' },
		])

		expect(missing).toEqual([
			{ set: 'simple-icons', name: 'definitely-not-real-zzz' },
		])
		expect(icons).toHaveLength(3)

		for (const icon of icons) {
			// viewBox 统一为 0 0 24 24
			expect(icon.viewBox).toBe('0 0 24 24')
			// title 必须被剥掉
			expect(icon.body).not.toContain('<title>')
			expect(icon.body).not.toContain('</title>')
			// fill 语义必须存在（填充型图标）
			expect(icon.body).toContain('fill="currentColor"')
			// license
			expect(icon.license?.spdx).toBe('CC0-1.0')
		}
	}, 120_000)
})
