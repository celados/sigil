import { describe, expect, test } from 'bun:test'

import { kebabCase, parseRef, pascalCase } from './ref.ts'

describe('parseRef', () => {
	test('accepts set/name only', () => {
		expect(parseRef('lucide/github')).toEqual({ set: 'lucide', name: 'github' })
		expect(parseRef('fa6-solid/arrow-up-1-9')).toEqual({
			set: 'fa6-solid',
			name: 'arrow-up-1-9',
		})
	})

	test('rejects malformed refs', () => {
		expect(() => parseRef('github')).toThrow('invalid ref')
		expect(() => parseRef('Lucide/Github')).toThrow('invalid ref')
		expect(() => parseRef('lucide/')).toThrow('invalid ref')
		expect(() => parseRef('lucide:github')).toThrow('invalid ref')
		expect(() => parseRef('lucide/house+menu')).toThrow('invalid ref')
		expect(() => parseRef('lucide/house,mdi/menu')).toThrow('invalid ref')
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
