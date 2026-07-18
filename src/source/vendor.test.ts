import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isFresh } from './vendor.ts'

const dir = '.scratch/is-fresh-test'

afterEach(() => {
	rmSync(dir, { recursive: true, force: true })
})

describe('isFresh', () => {
	test('无 stamp → stale(旧版 cache/缺失目录都会触发重新 vendor)', () => {
		expect(isFresh(dir)).toBe(false)
	})

	test('stamp 在 TTL 内 → fresh', () => {
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, '.sigil-timestamp'), String(Date.now()))
		expect(isFresh(dir)).toBe(true)
	})

	test('stamp 超过一天 → stale', () => {
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, '.sigil-timestamp'),
			String(Date.now() - 25 * 60 * 60 * 1000),
		)
		expect(isFresh(dir)).toBe(false)
	})
})
