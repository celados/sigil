import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Vendor cache 的 TTL:一天。 上游图标库变化慢,一天粒度足够新;过期判断只在 vendor()(use/add/etch
 * 的写路径)执行,search 保持只读、绝不触发网络。
 */
const TTL_MS = 24 * 60 * 60 * 1000

/** Clone 成功才写 stamp;stamp 缺失(旧版 cache/手建目录)一律视为 stale,触发重新 vendor */
const STAMP = '.sigil-timestamp'

export function isFresh(dir: string): boolean {
	try {
		const stamp = Number(readFileSync(join(dir, STAMP), 'utf-8'))
		return Date.now() - stamp < TTL_MS
	} catch {
		return false
	}
}

async function git(args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', ...args], {
		stdout: 'ignore',
		stderr: 'pipe',
	})
	if ((await proc.exited) !== 0) {
		throw new Error(
			`git ${args[0]} failed: ${(await new Response(proc.stderr).text()).trim()}`,
		)
	}
}

/**
 * Blobless sparse shallow clone:只下载指定路径的对象,秒级完成。 多进程可能同时 vendor 同一 set:clone 到
 * pid 独占的临时目录, 成功后原子 rename;rename 失败说明别的进程已就位,丢弃自己的副本。 rm(dir) 贴着
 * rename:并发读者要么看到旧目录要么看到新目录,空窗压到最小。
 */
export async function sparseClone(
	repo: string,
	dir: string,
	paths: string[],
): Promise<void> {
	await mkdir(dirname(dir), { recursive: true })
	const tmp = `${dir}.tmp-${process.pid}`
	await rm(tmp, { recursive: true, force: true })
	await git([
		'clone',
		'--depth=1',
		'--filter=blob:none',
		'--sparse',
		'--quiet',
		repo,
		tmp,
	])
	await git(['-C', tmp, 'sparse-checkout', 'set', ...paths])
	await rm(dir, { recursive: true, force: true })
	try {
		await rename(tmp, dir)
	} catch (e) {
		await rm(tmp, { recursive: true, force: true })
		if (!existsSync(dir)) throw e
	}
	writeFileSync(join(dir, STAMP), String(Date.now()))
}
