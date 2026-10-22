import {
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import type { RenderedFile } from './render/types.ts'

import { GENERATED_MARK } from './render/types.ts'

/**
 * Write a per-icon module directory. Re-etching after a manifest change must
 * not leave stale icons behind, but only ever removes files sigil generated
 * (they start with the generated mark); anything else in the directory stays.
 */
export function writeModules(output: string, files: RenderedFile[]): void {
	mkdirSync(output, { recursive: true })
	const keep = new Set(files.map((file) => file.path))
	for (const name of readdirSync(output)) {
		const path = join(output, name)
		if (
			!keep.has(name) &&
			/\.tsx?$/.test(name) &&
			readFileSync(path, 'utf8').startsWith(GENERATED_MARK)
		) {
			rmSync(path)
		}
	}
	for (const file of files) {
		writeFileSync(join(output, file.path), file.content)
	}
}
