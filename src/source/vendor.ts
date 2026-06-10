import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

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
 * pid 独占的临时目录, 成功后原子 rename;rename 失败说明别的进程已就位,丢弃自己的副本。
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
	try {
		await rename(tmp, dir)
	} catch (e) {
		await rm(tmp, { recursive: true, force: true })
		if (!existsSync(dir)) throw e
	}
}
