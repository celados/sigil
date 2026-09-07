import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDirs: string[] = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

function run(args: string[]) {
	const cwd = mkdtempSync(join(tmpdir(), 'sigil-cli-'))
	tempDirs.push(cwd)
	return {
		cwd,
		result: Bun.spawnSync({
			cmd: [process.execPath, join(import.meta.dir, 'index.ts'), ...args],
			cwd,
			stdout: 'pipe',
			stderr: 'pipe',
			env: {
				...process.env,
				XDG_CACHE_HOME: join(cwd, 'cache'),
			},
		}),
	}
}

describe('argc v7 command surface', () => {
	test('schema exposes structured add input', () => {
		const { result } = run(['@schema', '.add'])

		expect(result.exitCode).toBe(0)
		expect(result.stdout.toString()).toContain('refs: string[]')
		expect(result.stdout.toString()).toContain(
			"sigil add \"{ refs: ['lucide/house'",
		)
	})

	test('sources returns structured YAML on stdout', () => {
		const { result } = run(['sources', '{}'])
		const stdout = result.stdout.toString()

		expect(result.exitCode).toBe(0)
		expect(stdout).toContain('bundled:')
		expect(stdout).toContain('mode: bundled')
		expect(result.stderr.toString()).toBe('')
	})

	test('search scope is one set field without an all toggle', () => {
		const { result } = run(['@schema', '.search'])
		const stdout = result.stdout.toString()

		expect(result.exitCode).toBe(0)
		expect(stdout).toContain('set?: "*" | string')
		expect(stdout).not.toContain('all?:')
	})

	test('search rejects the removed all toggle', () => {
		const { result } = run(['search', "{ query: 'house', all: true }"])

		expect(result.exitCode).toBe(1)
		expect(result.stderr.toString()).toContain('at: all')
		expect(result.stderr.toString()).toContain('unknown key')
	})

	test('add rejects separator DSL as an invalid ref', () => {
		const { cwd, result } = run(['add', "{ refs: ['lucide/house+menu'] }"])

		expect(result.exitCode).toBe(1)
		expect(result.stderr.toString()).toContain('code: invalid_ref')
		expect(result.stdout.toString()).toBe('')
		expect(existsSync(join(cwd, 'icons.json'))).toBe(false)
	})
})
