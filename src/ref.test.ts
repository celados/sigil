import { describe, expect, test } from 'bun:test'

import { expandRefArgs, kebabCase, parseRef, pascalCase } from './ref.ts'

describe('parseRef', () => {
	test('accepts set/name and set:name', () => {
		expect(parseRef('lucide/github')).toEqual({ set: 'lucide', name: 'github' })
		expect(parseRef('lucide:github')).toEqual({ set: 'lucide', name: 'github' })
		expect(parseRef('fa6-solid/arrow-up-1-9')).toEqual({
			set: 'fa6-solid',
			name: 'arrow-up-1-9',
		})
	})

	test('rejects malformed refs', () => {
		expect(() => parseRef('github')).toThrow('invalid ref')
		expect(() => parseRef('Lucide/Github')).toThrow('invalid ref')
		expect(() => parseRef('lucide/')).toThrow('invalid ref')
	})
})

describe('expandRefArgs', () => {
	test('single-string DSL: "," separates sets, "+" joins icons', () => {
		expect(expandRefArgs(['lucide/a+b,mdi/c'])).toEqual([
			'lucide/a',
			'lucide/b',
			'mdi/c',
		])
	})

	test('space (multiple args) is equivalent to ","', () => {
		expect(expandRefArgs(['lucide/a+b', 'mdi/c'])).toEqual([
			'lucide/a',
			'lucide/b',
			'mdi/c',
		])
	})

	test('a "," segment without set/ falls through for parseRef to reject', () => {
		expect(expandRefArgs(['lucide/a,b'])).toEqual(['lucide/a', 'b'])
	})
})

describe('naming', () => {
	test('pascalCase', () => {
		expect(pascalCase('github-light')).toBe('GithubLight')
		expect(pascalCase('arrow-up-1-9')).toBe('ArrowUp19')
	})

	test('kebabCase round-trips component names', () => {
		expect(kebabCase('LuGithubLight')).toBe('lu-github-light')
	})
})
